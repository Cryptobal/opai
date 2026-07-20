/**
 * Cobro Confirmation Service (server-only)
 *
 * Dominio de la landing pública /cobro/[token]: el cliente aprueba / observa
 * una proforma o estado de pago e ingresa su N° de OC, sin login. El tenant se
 * deriva SIEMPRE del token (nunca de input del cliente). Token = mismo esquema
 * CSAT (24 bytes base64url), único por DTE, exp 90 días, scope = ese documento.
 * Acciones idempotentes. NO emite al SII ni toca montos.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generatePublicActionToken } from "@/lib/tickets-csat";
import { resolveBrandColors } from "@/modules/finance/billing/billing-doc-config.service";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { notifyClientAction } from "@/modules/finance/billing/cobro-notify";
import type { DraftAdditionalReference } from "@/modules/finance/billing/dte-draft.service";

export type CobroVariant = "PROFORMA" | "ESTADO_DE_PAGO";
export type CobroStatus = "NONE" | "SENT" | "VIEWED" | "APPROVED" | "REJECTED";
export type CobroAction = "VIEWED" | "APPROVED" | "REJECTED" | "OC_ADDED";

export type CobroErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_ISSUED"
  | "INVALID_STATE"
  | "COMMENT_REQUIRED"
  | "NOTHING_TO_ADD";

/** Error tipado de dominio; la API lo mapea a status HTTP + mensaje humano. */
export class CobroError extends Error {
  constructor(
    public readonly code: CobroErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CobroError";
  }
}

export interface CobroReference {
  tipoDocRef: string;
  folioRef: string;
}

export interface CobroView {
  variant: CobroVariant;
  status: CobroStatus;
  emisor: { razonSocial: string; rut: string };
  receptor: { nombre: string };
  branding: {
    brandName: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    emailContact: string;
  };
  periodo: string | null;
  fecha: string;
  neto: string;
  iva: string;
  total: string;
  references: CobroReference[];
  alreadyIssued: boolean;
  folio: number | null;
  expired: boolean;
}

export interface CobroActionMeta {
  ip?: string | null;
  ua?: string | null;
  actorEmail?: string | null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const EXPIRY_DAYS = 90;
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// ── Lectura / helpers ──

async function findDteByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return prisma.financeDte.findFirst({ where: { clientActionToken: token } });
}

type DteRow = NonNullable<Awaited<ReturnType<typeof findDteByToken>>>;

async function mustFindDte(token: string): Promise<DteRow> {
  const dte = await findDteByToken(token);
  if (!dte) throw new CobroError("NOT_FOUND", "Este enlace no es válido.");
  return dte;
}

/** PROFORMA si requireProforma; si no ESTADO_DE_PAGO; si ambas, PROFORMA. */
function activeVariant(dte: DteRow): CobroVariant {
  if (dte.requireProforma) return "PROFORMA";
  if (dte.requireEstadoPago) return "ESTADO_DE_PAGO";
  return "PROFORMA";
}

function variantStatus(dte: DteRow, v: CobroVariant): CobroStatus {
  return (v === "PROFORMA" ? dte.proformaStatus : dte.estadoPagoStatus) as CobroStatus;
}

function tokenExpired(dte: DteRow): boolean {
  return !!dte.clientActionTokenExp && dte.clientActionTokenExp.getTime() < Date.now();
}

/** Emitido = tiene folio real o salió del estado DRAFT hacia el SII. */
function isAlreadyIssued(dte: DteRow): boolean {
  return dte.folio > 0 || dte.siiStatus !== "DRAFT";
}

function fmtCurrency(n: number, currency: string): string {
  return currency === "UF"
    ? `${n.toFixed(2)} UF`
    : new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
      }).format(n);
}

function fmtPeriodo(period: string | null): string | null {
  if (!period) return null;
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  return `${MESES[m - 1]} ${y}`;
}

function fmtFecha(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(d);
}

function readReferences(dte: DteRow): CobroReference[] {
  const raw = dte.additionalReferences as DraftAdditionalReference[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({ tipoDocRef: r.tipoDocRef, folioRef: r.folioRef }));
}

const trunc = (s?: string | null): string | null => (s ? s.slice(0, 255) : null);

// ── Mutaciones internas ──

async function setVariantStatus(
  dteId: string,
  variant: CobroVariant,
  status: CobroStatus,
): Promise<void> {
  await prisma.financeDte.update({
    where: { id: dteId },
    data:
      variant === "PROFORMA"
        ? { proformaStatus: status }
        : { estadoPagoStatus: status },
  });
}

async function recordEvent(
  dte: DteRow,
  variant: CobroVariant,
  action: CobroAction,
  opts: {
    actorEmail?: string | null;
    comment?: string | null;
    ocFolio?: string | null;
    ip?: string | null;
    ua?: string | null;
  } = {},
): Promise<void> {
  await prisma.financeDteClientEvent.create({
    data: {
      tenantId: dte.tenantId,
      dteId: dte.id,
      variant,
      action,
      actorEmail: opts.actorEmail ?? null,
      comment: opts.comment ?? null,
      ocFolio: opts.ocFolio ?? null,
      ip: trunc(opts.ip),
      userAgent: trunc(opts.ua),
    },
  });
}

/**
 * Agrega referencias del cliente al borrador, sin inventar códigos SII:
 *   - N° de OC → referencia tipoDocRef "801" (Orden de Compra, código real del
 *     SII), dedupe por (tipoDocRef, folioRef). Viaja sola a la factura al emitir.
 *   - Referencia libre → NO se mapea a ningún tipoDocRef: se anexa a `notes`
 *     con prefijo [Cliente] + evento OC_ADDED.
 * Devuelve true si cambió algo.
 */
async function appendReferences(
  dte: DteRow,
  input: { ocFolio?: string | null; extraRef?: string | null; variant: CobroVariant },
): Promise<boolean> {
  const fresh = await prisma.financeDte.findUnique({
    where: { id: dte.id },
    select: { additionalReferences: true, notes: true },
  });
  const refs: DraftAdditionalReference[] = Array.isArray(fresh?.additionalReferences)
    ? [...(fresh!.additionalReferences as DraftAdditionalReference[])]
    : [];
  const data: Prisma.FinanceDteUpdateInput = {};
  let changed = false;

  const oc = input.ocFolio?.trim();
  if (oc) {
    const dup = refs.some((r) => r.tipoDocRef === "801" && r.folioRef === oc);
    if (!dup) {
      refs.push({
        tipoDocRef: "801",
        folioRef: oc,
        fchRef: new Date().toISOString().slice(0, 10),
      });
      data.additionalReferences = refs as unknown as Prisma.InputJsonValue;
      await recordEvent(dte, input.variant, "OC_ADDED", { ocFolio: oc });
      changed = true;
    }
  }

  const extra = input.extraRef?.trim();
  if (extra) {
    const line = `[Cliente] Ref: ${extra}`;
    data.notes = fresh?.notes ? `${fresh.notes}\n${line}` : line;
    await recordEvent(dte, input.variant, "OC_ADDED", { comment: extra });
    changed = true;
  }

  if (Object.keys(data).length > 0) {
    await prisma.financeDte.update({ where: { id: dte.id }, data });
  }
  return changed;
}

// ── API pública ──

/**
 * Devuelve el token vigente del DTE o genera uno nuevo (exp 90 días).
 * Idempotente: mientras el token no expire, siempre el mismo.
 */
export async function ensureClientActionToken(
  tenantId: string,
  dteId: string,
): Promise<string> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { clientActionToken: true, clientActionTokenExp: true },
  });
  if (!dte) throw new CobroError("NOT_FOUND", "DTE no encontrado.");
  if (
    dte.clientActionToken &&
    dte.clientActionTokenExp &&
    dte.clientActionTokenExp.getTime() > Date.now()
  ) {
    return dte.clientActionToken;
  }
  const token = generatePublicActionToken();
  const exp = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.financeDte.update({
    where: { id: dteId },
    data: { clientActionToken: token, clientActionTokenExp: exp },
  });
  return token;
}

/**
 * Contexto mínimo para renderizar el PDF público de la variante activa
 * (usado por /api/public/cobro/[token]/pdf). Deriva tenant + variante +
 * filename del token, sin exponer el DTE completo. null si el token no existe.
 */
export async function getCobroDocMeta(token: string): Promise<{
  tenantId: string;
  dteId: string;
  variant: CobroVariant;
  filename: string;
  expired: boolean;
} | null> {
  const dte = await findDteByToken(token);
  if (!dte) return null;
  const variant = activeVariant(dte);
  const filename =
    variant === "PROFORMA"
      ? `proforma-${dte.folio > 0 ? dte.folio : "draft"}.pdf`
      : `estado-pago-${dte.date.toISOString().slice(0, 10)}.pdf`;
  return {
    tenantId: dte.tenantId,
    dteId: dte.id,
    variant,
    filename,
    expired: tokenExpired(dte),
  };
}

async function buildView(dte: DteRow): Promise<CobroView> {
  const variant = activeVariant(dte);
  const colors = await resolveBrandColors(dte.tenantId);
  const company = await getTenantCompanyConfig(dte.tenantId);
  return {
    variant,
    status: variantStatus(dte, variant),
    emisor: { razonSocial: dte.issuerName, rut: dte.issuerRut },
    receptor: { nombre: dte.receiverName },
    branding: {
      brandName: company.commercialName || company.companyName || "",
      logoUrl: company.brandingLogoFull || "",
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      emailContact: company.emailContact || company.email || "",
    },
    periodo: fmtPeriodo(dte.billingPeriod),
    fecha: fmtFecha(dte.date),
    neto: fmtCurrency(Number(dte.netAmount), dte.currency),
    iva: fmtCurrency(Number(dte.taxAmount), dte.currency),
    total: fmtCurrency(Number(dte.totalAmount), dte.currency),
    references: readReferences(dte),
    alreadyIssued: isAlreadyIssued(dte),
    folio: dte.folio > 0 ? dte.folio : null,
    expired: tokenExpired(dte),
  };
}

/**
 * Vista pública por token. Efecto: la primera apertura mueve la variante
 * SENT → VIEWED (tracking; no degrada APPROVED/REJECTED ni toca documentos
 * emitidos/expirados). Devuelve null si el token no existe.
 */
export async function getPublicCobroView(
  token: string,
  meta: { ip?: string | null; ua?: string | null } = {},
): Promise<CobroView | null> {
  const dte = await findDteByToken(token);
  if (!dte) return null;
  const variant = activeVariant(dte);
  if (
    !tokenExpired(dte) &&
    !isAlreadyIssued(dte) &&
    variantStatus(dte, variant) === "SENT"
  ) {
    await setVariantStatus(dte.id, variant, "VIEWED");
    await recordEvent(dte, variant, "VIEWED", { ip: meta.ip, ua: meta.ua });
    if (variant === "PROFORMA") dte.proformaStatus = "VIEWED";
    else dte.estadoPagoStatus = "VIEWED";
  }
  return buildView(dte);
}

function assertActionable(dte: DteRow, variant: CobroVariant): void {
  if (tokenExpired(dte)) throw new CobroError("EXPIRED", "Este enlace expiró.");
  if (isAlreadyIssued(dte))
    throw new CobroError("ALREADY_ISSUED", "Este documento ya fue facturado.");
  const status = variantStatus(dte, variant);
  if (status !== "SENT" && status !== "VIEWED") {
    throw new CobroError("INVALID_STATE", "Este documento ya fue confirmado u observado.");
  }
}

/** Aprueba la variante activa (un toque). OC opcional en el mismo paso. */
export async function approveCobro(
  token: string,
  input: CobroActionMeta & { ocFolio?: string | null; extraRef?: string | null } = {},
): Promise<CobroView> {
  const dte = await mustFindDte(token);
  const variant = activeVariant(dte);
  assertActionable(dte, variant);
  await setVariantStatus(dte.id, variant, "APPROVED");
  const oc = input.ocFolio?.trim() || null;
  if (input.ocFolio || input.extraRef) {
    await appendReferences(dte, {
      ocFolio: input.ocFolio,
      extraRef: input.extraRef,
      variant,
    });
  }
  await recordEvent(dte, variant, "APPROVED", {
    actorEmail: input.actorEmail,
    ocFolio: oc,
    ip: input.ip,
    ua: input.ua,
  });
  await notifyClientAction({
    tenantId: dte.tenantId,
    dteId: dte.id,
    receiverName: dte.receiverName,
    variant,
    action: "APPROVED",
    actorEmail: input.actorEmail,
    ocFolio: oc,
  });
  return (await getPublicCobroView(token, { ip: input.ip, ua: input.ua }))!;
}

/** Solicita corrección con comentario obligatorio (→ REJECTED). */
export async function rejectCobro(
  token: string,
  input: CobroActionMeta & { comment: string },
): Promise<CobroView> {
  const comment = (input.comment ?? "").trim();
  if (!comment) {
    throw new CobroError("COMMENT_REQUIRED", "Cuéntanos qué necesitas corregir.");
  }
  const dte = await mustFindDte(token);
  const variant = activeVariant(dte);
  assertActionable(dte, variant);
  await setVariantStatus(dte.id, variant, "REJECTED");
  await recordEvent(dte, variant, "REJECTED", {
    comment,
    actorEmail: input.actorEmail,
    ip: input.ip,
    ua: input.ua,
  });
  await notifyClientAction({
    tenantId: dte.tenantId,
    dteId: dte.id,
    receiverName: dte.receiverName,
    variant,
    action: "REJECTED",
    actorEmail: input.actorEmail,
    comment,
  });
  return (await getPublicCobroView(token, { ip: input.ip, ua: input.ua }))!;
}

/**
 * Agrega referencias del cliente (OC / libre). Permitido también post-APPROVED
 * (el mockup lo contempla). Bloqueado solo si el documento ya fue facturado o
 * el token expiró.
 */
export async function addClientReference(
  token: string,
  input: CobroActionMeta & { ocFolio?: string | null; extraRef?: string | null },
): Promise<CobroView> {
  const dte = await mustFindDte(token);
  const variant = activeVariant(dte);
  if (tokenExpired(dte)) throw new CobroError("EXPIRED", "Este enlace expiró.");
  if (isAlreadyIssued(dte))
    throw new CobroError("ALREADY_ISSUED", "Este documento ya fue facturado.");
  if (!input.ocFolio?.trim() && !input.extraRef?.trim()) {
    throw new CobroError("NOTHING_TO_ADD", "Ingresa un N° de OC o una referencia.");
  }
  const changed = await appendReferences(dte, {
    ocFolio: input.ocFolio,
    extraRef: input.extraRef,
    variant,
  });
  if (changed) {
    await notifyClientAction({
      tenantId: dte.tenantId,
      dteId: dte.id,
      receiverName: dte.receiverName,
      variant,
      action: "OC_ADDED",
      actorEmail: input.actorEmail,
      ocFolio: input.ocFolio?.trim() || null,
      comment: input.extraRef?.trim() || null,
    });
  }
  return (await getPublicCobroView(token, { ip: input.ip, ua: input.ua }))!;
}
