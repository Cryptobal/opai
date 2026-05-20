/**
 * DTE Draft Service
 *
 * Borradores editables (siiStatus=DRAFT) que NO llaman al provider, NO
 * reservan folio CAF y NO generan asiento contable. Folio = 0 mientras es
 * DRAFT (la unicidad real es vía partial unique index que excluye DRAFT).
 *
 * Al "emitir" un borrador se llama a issueDte() con sus datos y, en éxito,
 * el borrador se elimina (su id no se preserva: el DTE emitido es nuevo).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { isDteTypeValid } from "../shared/constants/dte-types";
import { issueDte, type IssueDteInput } from "./dte-issuer.service";
import { computeDteAmounts } from "./dte-amounts.helper";
import {
  matchDraftToOccurrence,
  rebindDraftOccurrencesToIssued,
} from "@/modules/finance/cashflow/draft-occurrence-matcher.service";
import {
  formatDateOnlyUtcYmd,
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";

const DRAFT_REQUIRED_REFERENCE = [56, 61] as const;

/**
 * Mismo shape que IssueDteInput pero con receiver* opcionales: el usuario
 * puede ir guardando borradores con datos parciales antes de completar
 * todo. La validación dura corre al emitir el draft (issueDraftDte).
 */
export type DraftDteInput = Omit<IssueDteInput, "receiverRut" | "receiverName"> & {
  receiverRut?: string;
  receiverName?: string;
  // Plan de Documento de Cobro: configurado por el usuario al crear/editar
  // el borrador. No es parte del IssueDte — el SII no sabe nada de esto;
  // es metadata interna que controla el envío de Proforma / Estado de Pago.
  requireProforma?: boolean;
  proformaRecipientContactIds?: string[];
  requireEstadoPago?: boolean;
  estadoPagoRecipientContactIds?: string[];
};

/**
 * Crea un borrador (FinanceDte siiStatus=DRAFT). NO llama al provider,
 * NO reserva folio. Permite receptor parcial — la validación dura se
 * aplica recién al emitir.
 */
export async function createDraftDte(
  tenantId: string,
  createdBy: string,
  input: DraftDteInput,
  opts?: { ufOverride?: number },
) {
  if (!isDteTypeValid(input.dteType)) {
    throw new Error(`Tipo de DTE ${input.dteType} no es valido`);
  }

  // strict=false en draft: tolera unitPrice CLP con decimales para no
  // romper drafts existentes generados con la lógica vieja. La validación
  // estricta corre al emitir (issuer) — si el draft tiene drift, el
  // usuario lo verá al pasar por el preview antes de emitir.
  // ufOverride: si se pasa, se usa esa UF (en vez de la del día). Lo
  // usa la facturación recurrente con UF policy distinta de RUN_DAY.
  const calc = await computeDteAmounts(input, {
    strict: false,
    ufOverride: opts?.ufOverride,
  });

  const emissionDate =
    input.issueDate?.trim() != null && input.issueDate.trim() !== ""
      ? parseYmdToDbDate(input.issueDate.trim())
      : parseYmdToDbDate(todayChileStr());

  const draft = await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "ISSUED",
      dteType: input.dteType,
      folio: 0,
      code: `DRAFT-${randomUUID().slice(0, 8)}`,
      date: emissionDate,
      issuerRut: "",
      issuerName: "",
      receiverRut: input.receiverRut ?? "",
      receiverName: input.receiverName ?? "",
      receiverEmail: input.receiverEmail ?? null,
      receiverEmailCc: input.receiverEmailCc ?? [],
      receiverGiro: input.receiverGiro ?? null,
      receiverDireccion: input.receiverDireccion ?? null,
      receiverComuna: input.receiverComuna ?? null,
      receiverCiudad: input.receiverCiudad ?? null,
      crmAccountId: input.crmAccountId ?? null,
      installationId: input.installationId ?? null,
      currency: (input.currency as Prisma.FinanceDteCreateInput["currency"]) ?? "CLP",
      exchangeRate: calc.ufValue ?? null,
      ufValueAtIssue: calc.ufValue ?? null,
      ufDateAtIssue: calc.ufDate ?? null,
      netAmount: calc.totalNet,
      exemptAmount: calc.totalExempt,
      taxRate: calc.taxRate,
      taxAmount: calc.taxAmount,
      totalAmount: calc.totalAmount,
      siiStatus: "DRAFT",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: calc.totalAmount,
      accountId: input.accountId ?? null,
      createdBy,
      notes: input.notes ?? null,
      referenceDteId: input.reference?.docId ?? null,
      referenceType: input.reference?.type ?? null,
      referenceFolio: input.reference?.folio ?? null,
      referenceDate: input.reference?.date ? new Date(input.reference.date) : null,
      referenceCode: input.reference?.code ?? null,
      referenceReason: input.reference?.reason ?? null,
      additionalReferences:
        input.additionalReferences && input.additionalReferences.length > 0
          ? (input.additionalReferences as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      // Plan de Documento de Cobro (Proforma / Estado de Pago).
      requireProforma: input.requireProforma ?? false,
      proformaRecipientContactIds: input.proformaRecipientContactIds ?? [],
      requireEstadoPago: input.requireEstadoPago ?? false,
      estadoPagoRecipientContactIds: input.estadoPagoRecipientContactIds ?? [],
      lines: {
        create: calc.lines.map((l, i) => ({
          lineNumber: i + 1,
          itemCode: l.itemCode ?? null,
          itemName: l.itemName,
          description: l.description ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPrice: l.unitPrice,
          unitPriceUf: l.unitPriceUf ?? null,
          discountPct: l.discountPct ?? 0,
          netAmount: l.netAmount,
          isExempt: l.isExempt ?? false,
          accountId: l.accountId ?? null,
          costCenterId: l.costCenterId ?? null,
          refuerzoSolicitudId: l.refuerzoSolicitudId ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  // Auto-match con flujo de caja (best effort, no romper si falla).
  try {
    await matchDraftToOccurrence({
      tenantId,
      dteId: draft.id,
      crmAccountId: draft.crmAccountId,
      installationId: draft.installationId,
      expectedDate: draft.date,
      amountClp: Number(draft.totalAmount),
    });
  } catch (err) {
    console.error("[dte-draft] auto-match falló (no bloqueante):", err);
  }

  return draft;
}

/**
 * Nuevo borrador con los mismos datos que un borrador existente (siiStatus=DRAFT).
 * No copia folio, track SII ni vínculos a emisiones; genera code nuevo y
 * re-ejecuta match de flujo de caja como todo borrador nuevo.
 */
export async function cloneDraftDte(
  tenantId: string,
  createdBy: string,
  sourceDraftId: string,
) {
  const original = await prisma.financeDte.findFirst({
    where: {
      id: sourceDraftId,
      tenantId,
      direction: "ISSUED",
      siiStatus: "DRAFT",
    },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!original) {
    throw new Error("Borrador no encontrado o ya fue emitido");
  }

  const refCode = original.referenceCode;
  const input: DraftDteInput = {
    issueDate: formatDateOnlyUtcYmd(original.date),
    dteType: original.dteType,
    receiverRut: original.receiverRut || undefined,
    receiverName: original.receiverName || undefined,
    receiverEmail: original.receiverEmail ?? undefined,
    receiverEmailCc: original.receiverEmailCc,
    receiverGiro: original.receiverGiro ?? undefined,
    receiverDireccion: original.receiverDireccion ?? undefined,
    receiverComuna: original.receiverComuna ?? undefined,
    receiverCiudad: original.receiverCiudad ?? undefined,
    crmAccountId: original.crmAccountId ?? undefined,
    installationId: original.installationId ?? undefined,
    accountId: original.accountId ?? undefined,
    currency: original.currency,
    notes: original.notes ?? undefined,
    lines: original.lines.map((l) => ({
      itemCode: l.itemCode ?? undefined,
      itemName: l.itemName,
      description: l.description ?? undefined,
      quantity: l.quantity.toNumber(),
      unit: l.unit ?? undefined,
      unitPrice: l.unitPrice.toNumber(),
      unitPriceUf: l.unitPriceUf?.toNumber(),
      discountPct: l.discountPct.toNumber(),
      isExempt: l.isExempt,
      accountId: l.accountId ?? undefined,
      costCenterId: l.costCenterId ?? undefined,
      refuerzoSolicitudId: l.refuerzoSolicitudId ?? undefined,
    })),
    reference:
      original.referenceType != null &&
      original.referenceFolio != null &&
      original.referenceDate != null &&
      refCode != null
        ? {
            docId: original.referenceDteId ?? undefined,
            type: original.referenceType,
            folio: original.referenceFolio,
            date: formatDateOnlyUtcYmd(original.referenceDate),
            code: refCode as 1 | 2 | 3,
            reason: original.referenceReason ?? "",
          }
        : undefined,
    additionalReferences:
      (original.additionalReferences as IssueDteInput["additionalReferences"]) ??
      undefined,
    requireProforma: original.requireProforma,
    proformaRecipientContactIds: original.proformaRecipientContactIds ?? [],
    requireEstadoPago: original.requireEstadoPago,
    estadoPagoRecipientContactIds: original.estadoPagoRecipientContactIds ?? [],
  };

  const ufOverride =
    original.currency === "UF" && original.ufValueAtIssue != null
      ? Number(original.ufValueAtIssue)
      : undefined;

  return createDraftDte(tenantId, createdBy, input, { ufOverride });
}

export async function updateDraftDte(
  tenantId: string,
  draftId: string,
  input: DraftDteInput,
  opts?: { ufOverride?: number },
) {
  const existing = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: { id: true },
  });
  if (!existing) throw new Error("Borrador no encontrado o ya emitido");

  // Mismo tratamiento que createDraftDte: tolerante en update para no
  // romper drafts viejos. Validación estricta corre al emitir.
  const calc = await computeDteAmounts(input, {
    strict: false,
    ufOverride: opts?.ufOverride,
  });

  return prisma.$transaction(async (tx) => {
    await tx.financeDteLine.deleteMany({ where: { dteId: draftId } });
    return tx.financeDte.update({
      where: { id: draftId },
      data: {
        ...(input.issueDate?.trim()
          ? { date: parseYmdToDbDate(input.issueDate.trim()) }
          : {}),
        dteType: input.dteType,
        receiverRut: input.receiverRut ?? "",
        receiverName: input.receiverName ?? "",
        receiverEmail: input.receiverEmail ?? null,
        receiverEmailCc: input.receiverEmailCc ?? [],
        receiverGiro: input.receiverGiro ?? null,
        receiverDireccion: input.receiverDireccion ?? null,
        receiverComuna: input.receiverComuna ?? null,
        receiverCiudad: input.receiverCiudad ?? null,
        crmAccountId: input.crmAccountId ?? null,
        installationId: input.installationId ?? null,
        currency: (input.currency as Prisma.FinanceDteCreateInput["currency"]) ?? "CLP",
        exchangeRate: calc.ufValue ?? null,
        ufValueAtIssue: calc.ufValue ?? null,
        ufDateAtIssue: calc.ufDate ?? null,
        netAmount: calc.totalNet,
        exemptAmount: calc.totalExempt,
        taxRate: calc.taxRate,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        amountPending: calc.totalAmount,
        notes: input.notes ?? null,
        referenceDteId: input.reference?.docId ?? null,
        referenceType: input.reference?.type ?? null,
        referenceFolio: input.reference?.folio ?? null,
        referenceDate: input.reference?.date ? new Date(input.reference.date) : null,
        referenceCode: input.reference?.code ?? null,
        referenceReason: input.reference?.reason ?? null,
        additionalReferences:
          input.additionalReferences && input.additionalReferences.length > 0
            ? (input.additionalReferences as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        // Plan de Documento de Cobro (mismo tratamiento que create).
        requireProforma: input.requireProforma ?? false,
        proformaRecipientContactIds: input.proformaRecipientContactIds ?? [],
        requireEstadoPago: input.requireEstadoPago ?? false,
        estadoPagoRecipientContactIds: input.estadoPagoRecipientContactIds ?? [],
        lines: {
          create: calc.lines.map((l, i) => ({
            lineNumber: i + 1,
            itemCode: l.itemCode ?? null,
            itemName: l.itemName,
            description: l.description ?? null,
            quantity: l.quantity,
            unit: l.unit ?? null,
            unitPrice: l.unitPrice,
            unitPriceUf: l.unitPriceUf ?? null,
            discountPct: l.discountPct ?? 0,
            netAmount: l.netAmount,
            isExempt: l.isExempt ?? false,
            accountId: l.accountId ?? null,
            costCenterId: l.costCenterId ?? null,
            refuerzoSolicitudId: l.refuerzoSolicitudId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  });
}

export async function deleteDraftDte(tenantId: string, draftId: string) {
  const existing = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: { id: true },
  });
  if (!existing) throw new Error("Borrador no encontrado o ya emitido");

  await prisma.$transaction(async (tx) => {
    // 1. Localizar runs asociados al draft.
    const runs = await tx.financeDteRecurringRun.findMany({
      where: { tenantId, dteId: draftId },
      select: { id: true },
    });

    // 2. Limpiar autoSendIssues y anotar la eliminación en `error` para auditoría.
    if (runs.length > 0) {
      await tx.financeDteRecurringRun.updateMany({
        where: { id: { in: runs.map((r) => r.id) } },
        data: {
          autoSendIssues: Prisma.DbNull,
          error: `Borrador eliminado manualmente el ${new Date().toISOString().slice(0, 10)}`,
        },
      });
    }

    // 3. Eliminar el draft. El `dteId` del run queda null por SetNull (definido en schema).
    await tx.financeDte.delete({ where: { id: draftId } });
  });
}

/**
 * Promueve un borrador a DTE emitido. Llama a issueDte() con los datos
 * persistidos. Si la emisión falla, el borrador queda intacto. En éxito,
 * el borrador se elimina (su id no se preserva: el DTE real es nuevo
 * con folio asignado y siiStatus=PENDING).
 */
export async function issueDraftDte(
  tenantId: string,
  draftId: string,
  issuedBy: string,
  overrides?: {
    autoSendEmail?: boolean;
    sendXmlToBackoffice?: boolean;
    backofficeEmailsOverride?: string[];
    /** UF a usar en lugar de la del día. Si no viene y el draft tiene
     * `ufValueAtIssue`, se usa esa (asumimos que es la UF que el usuario
     * dejó pactada). Para forzar la UF del día, pasar `ufOverride: undefined`
     * y borrar `ufValueAtIssue` antes en el draft. */
    ufOverride?: number;
  },
) {
  const draft = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!draft) throw new Error("Borrador no encontrado o ya emitido");
  if (!draft.receiverRut?.trim()) throw new Error("Borrador requiere RUT del receptor");
  if (!draft.receiverName?.trim()) throw new Error("Borrador requiere razón social del receptor");
  if (DRAFT_REQUIRED_REFERENCE.includes(draft.dteType as 56 | 61)) {
    if (!draft.referenceFolio || !draft.referenceType || !draft.referenceDate || !draft.referenceCode) {
      throw new Error(`Tipo ${draft.dteType} (NC/ND) requiere referencia al DTE original`);
    }
  }

  const input: IssueDteInput = {
    issueDate: formatDateOnlyUtcYmd(draft.date),
    dteType: draft.dteType,
    receiverRut: draft.receiverRut,
    receiverName: draft.receiverName,
    receiverEmail: draft.receiverEmail ?? undefined,
    receiverEmailCc: draft.receiverEmailCc,
    receiverGiro: draft.receiverGiro ?? undefined,
    receiverDireccion: draft.receiverDireccion ?? undefined,
    receiverComuna: draft.receiverComuna ?? undefined,
    receiverCiudad: draft.receiverCiudad ?? undefined,
    crmAccountId: draft.crmAccountId ?? undefined,
    installationId: draft.installationId ?? undefined,
    currency: draft.currency,
    notes: draft.notes ?? undefined,
    accountId: draft.accountId ?? undefined,
    autoSendEmail: overrides?.autoSendEmail,
    sendXmlToBackoffice: overrides?.sendXmlToBackoffice,
    backofficeEmailsOverride: overrides?.backofficeEmailsOverride,
    lines: draft.lines.map((l) => ({
      itemCode: l.itemCode ?? undefined,
      itemName: l.itemName,
      description: l.description ?? undefined,
      quantity: l.quantity.toNumber(),
      unit: l.unit ?? undefined,
      unitPrice: l.unitPrice.toNumber(),
      unitPriceUf: l.unitPriceUf?.toNumber(),
      discountPct: l.discountPct.toNumber(),
      isExempt: l.isExempt,
      accountId: l.accountId ?? undefined,
      costCenterId: l.costCenterId ?? undefined,
      refuerzoSolicitudId: l.refuerzoSolicitudId ?? undefined,
    })),
    reference:
      draft.referenceType && draft.referenceFolio && draft.referenceDate && draft.referenceCode
        ? {
            docId: draft.referenceDteId ?? undefined,
            type: draft.referenceType,
            folio: draft.referenceFolio,
            date: formatDateOnlyUtcYmd(draft.referenceDate),
            code: draft.referenceCode as 1 | 2 | 3,
            reason: draft.referenceReason ?? "",
          }
        : undefined,
    additionalReferences: (draft.additionalReferences as IssueDteInput["additionalReferences"]) ?? undefined,
  };

  // ufOverride: priorizamos el override explícito; si no viene, usamos la
  // UF que quedó persistida en el draft (`ufValueAtIssue`) — esa es la UF
  // que el usuario "fijó" al guardar (sea por valor manual o por la UF del
  // día en que se creó). Si tampoco hay, el issuer usa la UF del día actual.
  const ufOverride = overrides?.ufOverride
    ?? (draft.currency === "UF" && draft.ufValueAtIssue
        ? Number(draft.ufValueAtIssue)
        : undefined);

  const issued = await issueDte(tenantId, issuedBy, input, { ufOverride });

  // Reasignar occurrences que apuntaban al draft → al nuevo DTE emitido,
  // antes de borrar el draft (la FK es ON DELETE SET NULL, pero queremos
  // preservar el vínculo en el flujo de caja).
  try {
    await rebindDraftOccurrencesToIssued(tenantId, draftId, issued.id);
  } catch (err) {
    console.error("[dte-draft] rebind a issued falló (no bloqueante):", err);
  }

  // Borrar el borrador solo tras éxito de issueDte. Si falla arriba, el
  // throw burbujea y el borrador queda intacto para corrección manual.
  await prisma.financeDte.delete({ where: { id: draftId } });
  return issued;
}

// ── Shapes serializables expuestos a clientes ──
// La capa de UI consume Number/string/null en vez de Decimal/Date para
// evitar serializadores ad-hoc en cada consumidor.

export type DraftProformaStatus =
  | "NONE"
  | "SENT"
  | "VIEWED"
  | "APPROVED"
  | "REJECTED";

export type DraftAdditionalReference = {
  tipoDocRef: string;
  folioRef: string;
  fchRef?: string;
  razonRef?: string;
};

export type DraftLineItem = {
  id: string;
  lineNumber: number;
  description: string;
  itemName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  unitPriceUf: number | null;
  discountPct: number;
  isExempt: boolean;
  accountId: string | null;
  lineTotal: number;
};

export type DraftListItem = {
  id: string;
  date: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  dteType: number;
  receiverName: string | null;
  receiverRut: string | null;
  receiverEmail: string | null;
  totalAmount: number;
  netAmount: number;
  taxAmount: number;
  currency: string;
  requireProforma: boolean;
  proformaStatus: DraftProformaStatus;
  proformaSentAt: string | null;
  proformaSentCount: number;
  proformaLastRecipient: string | null;
  requireEstadoPago: boolean;
  estadoPagoStatus: DraftProformaStatus;
  estadoPagoSentAt: string | null;
  estadoPagoSentCount: number;
  estadoPagoLastRecipient: string | null;
  additionalReferences: DraftAdditionalReference[] | null;
  installationId: string | null;
  installationName: string | null;
  installationCommune: string | null;
  crmAccountId: string | null;
  crmAccountName: string | null;
  templateId: string | null;
  templateName: string | null;
  lines: DraftLineItem[];
};

export type DraftEmailLogItem = {
  id: string;
  kind: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  status: string;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  errorMessage: string | null;
  sentBy: string | null;
};

export type DraftDetailItem = DraftListItem & {
  notes: string | null;
  accountId: string | null;
  receiverEmailCc: string[];
  receiverGiro: string | null;
  receiverDireccion: string | null;
  receiverComuna: string | null;
  receiverCiudad: string | null;
  ufValueAtIssue: number | null;
  proformaRecipientContactIds: string[];
  estadoPagoRecipientContactIds: string[];
  emailLogs: DraftEmailLogItem[];
};

const DRAFT_LIST_SELECT = {
  id: true,
  date: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  dteType: true,
  receiverName: true,
  receiverRut: true,
  receiverEmail: true,
  totalAmount: true,
  netAmount: true,
  taxAmount: true,
  currency: true,
  installationId: true,
  crmAccountId: true,
  requireProforma: true,
  proformaStatus: true,
  proformaSentAt: true,
  proformaSentCount: true,
  proformaLastRecipient: true,
  requireEstadoPago: true,
  estadoPagoStatus: true,
  estadoPagoSentAt: true,
  estadoPagoSentCount: true,
  estadoPagoLastRecipient: true,
  additionalReferences: true,
  lines: {
    select: {
      id: true,
      lineNumber: true,
      description: true,
      itemName: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      unitPriceUf: true,
      discountPct: true,
      isExempt: true,
      accountId: true,
      netAmount: true,
    },
    orderBy: { lineNumber: "asc" as const },
    take: 50,
  },
} satisfies Prisma.FinanceDteSelect;

type RawDraftListRow = Prisma.FinanceDteGetPayload<{
  select: typeof DRAFT_LIST_SELECT;
}>;

function serializeLine(l: RawDraftListRow["lines"][number]): DraftLineItem {
  return {
    id: l.id,
    lineNumber: l.lineNumber,
    description: l.description ?? l.itemName,
    itemName: l.itemName,
    quantity: Number(l.quantity),
    unit: l.unit,
    unitPrice: Number(l.unitPrice),
    unitPriceUf: l.unitPriceUf != null ? Number(l.unitPriceUf) : null,
    discountPct: Number(l.discountPct),
    isExempt: l.isExempt,
    accountId: l.accountId,
    lineTotal: Number(l.netAmount),
  };
}

type RefMaps = {
  installations: Map<string, { id: string; name: string; commune: string | null }>;
  accounts: Map<string, { id: string; name: string }>;
  /** draftId → template that generated it (most recent run). */
  templateByDraft: Map<string, { id: string; name: string }>;
};

function serializeDraftBase(d: RawDraftListRow, refs?: RefMaps): DraftListItem {
  const additionalRefs = d.additionalReferences as DraftAdditionalReference[] | null | undefined;
  const installation = d.installationId ? refs?.installations.get(d.installationId) ?? null : null;
  const account = d.crmAccountId ? refs?.accounts.get(d.crmAccountId) ?? null : null;
  const template = refs?.templateByDraft.get(d.id) ?? null;
  return {
    id: d.id,
    date: d.date.toISOString(),
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    dteType: d.dteType,
    receiverName: d.receiverName || null,
    receiverRut: d.receiverRut || null,
    receiverEmail: d.receiverEmail,
    totalAmount: Number(d.totalAmount),
    netAmount: Number(d.netAmount),
    taxAmount: Number(d.taxAmount),
    currency: d.currency,
    requireProforma: d.requireProforma,
    proformaStatus: d.proformaStatus,
    proformaSentAt: d.proformaSentAt ? d.proformaSentAt.toISOString() : null,
    proformaSentCount: d.proformaSentCount,
    proformaLastRecipient: d.proformaLastRecipient,
    requireEstadoPago: d.requireEstadoPago,
    estadoPagoStatus: d.estadoPagoStatus,
    estadoPagoSentAt: d.estadoPagoSentAt ? d.estadoPagoSentAt.toISOString() : null,
    estadoPagoSentCount: d.estadoPagoSentCount,
    estadoPagoLastRecipient: d.estadoPagoLastRecipient,
    additionalReferences: Array.isArray(additionalRefs) && additionalRefs.length > 0 ? additionalRefs : null,
    installationId: d.installationId,
    installationName: installation?.name ?? null,
    installationCommune: installation?.commune ?? null,
    crmAccountId: d.crmAccountId,
    crmAccountName: account?.name ?? null,
    templateId: template?.id ?? null,
    templateName: template?.name ?? null,
    lines: d.lines.map(serializeLine),
  };
}

async function resolveRefMaps(
  tenantId: string,
  drafts: Array<{ id: string; installationId: string | null; crmAccountId: string | null }>,
): Promise<RefMaps> {
  const installationIds = [
    ...new Set(drafts.map((d) => d.installationId).filter((x): x is string => Boolean(x))),
  ];
  const accountIds = [
    ...new Set(drafts.map((d) => d.crmAccountId).filter((x): x is string => Boolean(x))),
  ];
  const draftIds = drafts.map((d) => d.id);
  const [installations, accounts, runs] = await Promise.all([
    installationIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true, commune: true },
        })
      : Promise.resolve([]),
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    draftIds.length > 0
      ? prisma.financeDteRecurringRun.findMany({
          where: { tenantId, dteId: { in: draftIds } },
          orderBy: { ranAt: "desc" },
          select: {
            dteId: true,
            template: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  // Tomar el primer match (más reciente por orderBy desc) por draft.
  const templateByDraft = new Map<string, { id: string; name: string }>();
  for (const r of runs) {
    if (r.dteId && !templateByDraft.has(r.dteId) && r.template) {
      templateByDraft.set(r.dteId, r.template);
    }
  }
  return {
    installations: new Map(installations.map((i) => [i.id, i])),
    accounts: new Map(accounts.map((a) => [a.id, a])),
    templateByDraft,
  };
}

export async function listDraftDtes(
  tenantId: string,
  opts: { page: number; pageSize: number; search?: string },
): Promise<{ drafts: DraftListItem[]; total: number }> {
  const where: Prisma.FinanceDteWhereInput = {
    tenantId,
    direction: "ISSUED",
    siiStatus: "DRAFT",
    ...(opts.search
      ? {
          OR: [
            { receiverName: { contains: opts.search, mode: "insensitive" } },
            { receiverRut: { contains: opts.search } },
          ],
        }
      : {}),
  };
  const [drafts, total] = await Promise.all([
    prisma.financeDte.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: opts.pageSize,
      skip: (opts.page - 1) * opts.pageSize,
      select: DRAFT_LIST_SELECT,
    }),
    prisma.financeDte.count({ where }),
  ]);
  const refs = await resolveRefMaps(tenantId, drafts);
  return { drafts: drafts.map((d) => serializeDraftBase(d, refs)), total };
}

export async function getDraftDteById(
  tenantId: string,
  draftId: string,
): Promise<DraftDetailItem | null> {
  const draft = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: {
      ...DRAFT_LIST_SELECT,
      notes: true,
      accountId: true,
      crmAccountId: true,
      installationId: true,
      receiverEmailCc: true,
      receiverGiro: true,
      receiverDireccion: true,
      receiverComuna: true,
      receiverCiudad: true,
      ufValueAtIssue: true,
      proformaRecipientContactIds: true,
      estadoPagoRecipientContactIds: true,
      emailLogs: {
        where: {
          kind: {
            in: [
              "AUTO_PROFORMA",
              "MANUAL_PROFORMA",
              "AUTO_ESTADO_PAGO",
              "MANUAL_ESTADO_PAGO",
            ],
          },
        },
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          kind: true,
          to: true,
          cc: true,
          bcc: true,
          subject: true,
          status: true,
          sentAt: true,
          deliveredAt: true,
          openedAt: true,
          bouncedAt: true,
          complainedAt: true,
          errorMessage: true,
          sentBy: true,
        },
        take: 30,
      },
    },
  });
  if (!draft) return null;

  const refs = await resolveRefMaps(tenantId, [draft]);
  const base = serializeDraftBase(draft, refs);
  return {
    ...base,
    notes: draft.notes,
    accountId: draft.accountId,
    receiverEmailCc: draft.receiverEmailCc,
    receiverGiro: draft.receiverGiro,
    receiverDireccion: draft.receiverDireccion,
    receiverComuna: draft.receiverComuna,
    receiverCiudad: draft.receiverCiudad,
    ufValueAtIssue: draft.ufValueAtIssue != null ? Number(draft.ufValueAtIssue) : null,
    proformaRecipientContactIds: draft.proformaRecipientContactIds,
    estadoPagoRecipientContactIds: draft.estadoPagoRecipientContactIds,
    emailLogs: draft.emailLogs.map((log) => ({
      id: log.id,
      kind: log.kind,
      to: log.to,
      cc: log.cc,
      bcc: log.bcc,
      subject: log.subject,
      status: log.status,
      sentAt: log.sentAt.toISOString(),
      deliveredAt: log.deliveredAt ? log.deliveredAt.toISOString() : null,
      openedAt: log.openedAt ? log.openedAt.toISOString() : null,
      bouncedAt: log.bouncedAt ? log.bouncedAt.toISOString() : null,
      complainedAt: log.complainedAt ? log.complainedAt.toISOString() : null,
      errorMessage: log.errorMessage,
      sentBy: log.sentBy,
    })),
  };
}

