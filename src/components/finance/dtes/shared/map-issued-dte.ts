/**
 * Mapper del payload de GET /api/finance/billing/issued → DteRow.
 * También aplica el parche local tras enviar proforma / estado de pago.
 */
import type { DraftProformaStatus } from "@/modules/finance/billing/dte-draft.service";
import { normalizeAdditionalRefs } from "./references";
import type { DteRow } from "./types";

const PROFORMA_STATUSES: ReadonlySet<DraftProformaStatus> = new Set([
  "NONE",
  "SENT",
  "VIEWED",
  "APPROVED",
  "REJECTED",
]);

export function parseDraftProformaStatus(value: unknown): DraftProformaStatus {
  return typeof value === "string" &&
    PROFORMA_STATUSES.has(value as DraftProformaStatus)
    ? (value as DraftProformaStatus)
    : "NONE";
}

function asIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value);
}

function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseBillingSendFields(d: Record<string, unknown>): Pick<
  DteRow,
  | "requireProforma"
  | "proformaStatus"
  | "proformaSentAt"
  | "proformaSentCount"
  | "proformaLastRecipient"
  | "requireEstadoPago"
  | "estadoPagoStatus"
  | "estadoPagoSentAt"
  | "estadoPagoSentCount"
  | "estadoPagoLastRecipient"
> {
  return {
    requireProforma: Boolean(d.requireProforma),
    proformaStatus: parseDraftProformaStatus(d.proformaStatus),
    proformaSentAt: asIso(d.proformaSentAt),
    proformaSentCount: asCount(d.proformaSentCount),
    proformaLastRecipient:
      typeof d.proformaLastRecipient === "string" ? d.proformaLastRecipient : null,
    requireEstadoPago: Boolean(d.requireEstadoPago),
    estadoPagoStatus: parseDraftProformaStatus(d.estadoPagoStatus),
    estadoPagoSentAt: asIso(d.estadoPagoSentAt),
    estadoPagoSentCount: asCount(d.estadoPagoSentCount),
    estadoPagoLastRecipient:
      typeof d.estadoPagoLastRecipient === "string"
        ? d.estadoPagoLastRecipient
        : null,
  };
}

export function mapIssuedApiDteToRow(d: Record<string, unknown>): DteRow {
  return {
    id: String(d.id),
    dteType: Number(d.dteType),
    folio: Number(d.folio),
    receiverRut: String(d.receiverRut ?? ""),
    receiverName: String(d.receiverName ?? ""),
    receiverEmail: (d.receiverEmail as string | null) ?? null,
    receiverEmailCc: Array.isArray(d.receiverEmailCc)
      ? (d.receiverEmailCc as string[])
      : [],
    netAmount: Number(d.netAmount),
    taxAmount: Number(d.taxAmount),
    totalAmount: Number(d.totalAmount),
    siiStatus: String(d.siiStatus ?? ""),
    currency: String(d.currency ?? "CLP"),
    linesCount: Array.isArray(d.lines) ? (d.lines as unknown[]).length : 0,
    createdAt: String(d.createdAt ?? ""),
    emailSentAt: (d.emailSentAt as string | null) ?? null,
    emailStatus: (d.emailStatus as string | null) ?? null,
    ...parseBillingSendFields(d),
    referenceType: (d.referenceType as number | null) ?? null,
    referenceFolio: (d.referenceFolio as number | null) ?? null,
    additionalReferences: normalizeAdditionalRefs(d.additionalReferences),
    hasXml: Boolean(d.hasXml),
    crmAccountId: (d.crmAccountId as string | null) ?? null,
    installationId: (d.installationId as string | null) ?? null,
    crmAccount:
      (d.crmAccount as
        | { id: string; name: string; legalName: string | null }
        | null) ?? null,
    installation:
      (d.installation as
        | { id: string; name: string; commune: string | null }
        | null) ?? null,
    canBeCeded: Boolean(d.canBeCeded),
    activeCession:
      (d.activeCession as
        | {
            id: string;
            code: string;
            status: string;
            factoringCompany?: string | null;
          }
        | null) ?? null,
    date: typeof d.date === "string" ? d.date : String(d.date ?? ""),
    dueDate: (d.dueDate as string | null) ?? null,
    paymentStatus: (d.paymentStatus as string | null) ?? null,
    lastReconciliation: (d.lastReconciliation as DteRow["lastReconciliation"]) ?? null,
    linkedCreditNote:
      (d.linkedCreditNote as
        | {
            count: number;
            hasFullAnnulment: boolean;
            creditedNet: number;
            primaryFolio: number;
          }
        | null) ?? null,
    voidedByCreditNoteId: (d.voidedByCreditNoteId as string | null) ?? null,
    voidedAt: (d.voidedAt as string | null) ?? null,
    creditedNetAmount:
      d.creditedNetAmount != null ? Number(d.creditedNetAmount) : 0,
  };
}

export function applyBillingDocSent(
  row: DteRow,
  variant: "PROFORMA" | "ESTADO_DE_PAGO",
  sentAt: string,
  recipient?: string | null,
): DteRow {
  if (variant === "PROFORMA") {
    return {
      ...row,
      proformaStatus: "SENT",
      proformaSentAt: sentAt,
      proformaSentCount: (row.proformaSentCount ?? 0) + 1,
      proformaLastRecipient: recipient ?? row.proformaLastRecipient ?? null,
    };
  }
  return {
    ...row,
    estadoPagoStatus: "SENT",
    estadoPagoSentAt: sentAt,
    estadoPagoSentCount: (row.estadoPagoSentCount ?? 0) + 1,
    estadoPagoLastRecipient: recipient ?? row.estadoPagoLastRecipient ?? null,
  };
}
