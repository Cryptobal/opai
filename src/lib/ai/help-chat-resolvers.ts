/**
 * Helpers compartidos de resolución para tools del asistente.
 *
 * Permiten a las tools recibir nombres/folios/RUTs naturales del usuario
 * y mapearlos a IDs reales del CRM/Finanzas, manejando ambigüedad.
 */
import { prisma } from "@/lib/prisma";

/**
 * Busca una etapa de pipeline por nombre fuzzy (case-insensitive, trim).
 * Devuelve el id si encuentra exactamente una; null si no encuentra; lanza
 * si hay ambigüedad (>1 match) para que la tool reporte el error al usuario.
 */
export async function resolveStageByName(
  tenantId: string,
  stageName: string,
): Promise<string | null> {
  const q = stageName.trim();
  if (!q) return null;
  const matches = await prisma.crmPipelineStage.findMany({
    where: {
      tenantId,
      isActive: true,
      name: { contains: q, mode: "insensitive" },
    },
    select: { id: true, name: true },
    take: 5,
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  const exact = matches.find((m) => m.name.toLowerCase() === q.toLowerCase());
  if (exact) return exact.id;
  throw new Error(
    `Etapa ambigua "${stageName}". Encontré: ${matches.map((m) => m.name).join(", ")}. Especifica.`,
  );
}

/**
 * Busca un account por RUT exacto (normalizado) o por nombre fuzzy.
 * Si solo hay un match, lo retorna; si hay varios, lanza con la lista.
 */
export async function resolveAccountByRutOrName(
  tenantId: string,
  rutOrName: string,
): Promise<{ id: string; name: string; rut: string | null } | null> {
  const q = rutOrName.trim();
  if (!q) return null;

  const rutClean = q.replace(/[.\-\s]/g, "").toUpperCase();
  const looksLikeRut = /^\d{7,9}[0-9K]$/.test(rutClean);

  if (looksLikeRut) {
    const normalized = `${rutClean.slice(0, -1)}-${rutClean.slice(-1)}`;
    const byRut = await prisma.crmAccount.findFirst({
      where: { tenantId, rut: normalized },
      select: { id: true, name: true, rut: true },
    });
    if (byRut) return byRut;
  }

  const matches = await prisma.crmAccount.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, rut: true },
    take: 5,
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const exact = matches.find((m) => m.name.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  throw new Error(
    `Cliente ambiguo "${rutOrName}". Encontré: ${matches.map((m) => m.name).join(", ")}. Especifica con RUT o nombre completo.`,
  );
}

/**
 * Busca una instalación por nombre fuzzy dentro de un account.
 * Si la instalación no existe Y `autoCreate` es true, la crea con datos mínimos.
 */
export async function resolveOrCreateInstallation(
  tenantId: string,
  accountId: string,
  installationName: string,
  opts?: { autoCreate?: boolean; address?: string; commune?: string },
): Promise<{ id: string; name: string; created: boolean }> {
  const q = installationName.trim();
  if (!q) throw new Error("Nombre de instalación vacío");

  const existing = await prisma.crmInstallation.findFirst({
    where: {
      tenantId,
      accountId,
      name: { equals: q, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  if (existing) return { ...existing, created: false };

  if (!opts?.autoCreate) {
    throw new Error(`Instalación "${installationName}" no existe en este cliente.`);
  }

  const { toSentenceCase } = await import("@/lib/text-format");
  const created = await prisma.crmInstallation.create({
    data: {
      tenantId,
      accountId,
      name: toSentenceCase(q) || q,
      address: opts.address ?? null,
      commune: opts.commune ?? null,
      status: "prospect",
      geoRadiusM: 1000,
      teMontoClp: 0,
      nocturnoEnabled: false,
      chatEnabled: false,
    },
    select: { id: true, name: true },
  });
  return { ...created, created: true };
}

const QUOTE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Busca una cotización CPQ por código exacto (insensitive), por UUID válido en `id`,
 * o por texto en código / nombre / cliente.
 * Devuelve null si no encuentra; lanza si hay más de una coincidencia plausible.
 */
export async function resolveQuoteByCodeOrName(
  tenantId: string,
  query: string,
): Promise<{ id: string; code: string; name: string | null } | null> {
  const q = query.trim();
  if (!q) return null;

  if (QUOTE_UUID_RE.test(q)) {
    const byId = await prisma.cpqQuote.findFirst({
      where: { id: q, tenantId },
      select: { id: true, code: true, name: true },
    });
    if (byId) return byId;
  }

  const byCode = await prisma.cpqQuote.findFirst({
    where: { tenantId, code: { equals: q, mode: "insensitive" } },
    select: { id: true, code: true, name: true },
  });
  if (byCode) return byCode;

  const matches = await prisma.cpqQuote.findMany({
    where: {
      tenantId,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { clientName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, code: true, name: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const ql = q.toLowerCase();
  const exact =
    matches.find((m) => m.code?.toLowerCase() === ql) ??
    matches.find((m) => m.name?.toLowerCase() === ql);
  if (exact) return exact;
  throw new Error(
    `Varias cotizaciones coinciden con "${query}". Ejemplos: ${matches.slice(0, 4).map((m) => m.code || m.name || m.id).join(", ")}. Dame el código exacto.`,
  );
}

/**
 * Busca un DTE emitido por folio dentro del tenant. Acepta string o number.
 * Devuelve el DTE con datos clave (sin lines) para usar como referencia
 * de NC/ND o para responder preguntas puntuales sobre una factura.
 */
export async function resolveDteByFolio(
  tenantId: string,
  folio: number | string,
): Promise<
  | {
      id: string;
      folio: number;
      dteType: number;
      receiverRut: string;
      receiverName: string;
      totalAmount: number;
      siiStatus: string;
      paymentStatus: string;
      date: Date;
    }
  | null
> {
  const f = typeof folio === "number" ? folio : parseInt(String(folio).replace(/\D/g, ""), 10);
  if (!Number.isFinite(f) || f <= 0) return null;
  const dte = await prisma.financeDte.findFirst({
    where: { tenantId, direction: "ISSUED", folio: f, siiStatus: { not: "DRAFT" } },
    select: {
      id: true,
      folio: true,
      dteType: true,
      receiverRut: true,
      receiverName: true,
      totalAmount: true,
      siiStatus: true,
      paymentStatus: true,
      date: true,
    },
  });
  if (!dte) return null;
  return { ...dte, totalAmount: Number(dte.totalAmount) };
}
