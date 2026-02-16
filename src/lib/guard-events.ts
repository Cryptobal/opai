/**
 * Guard Events — Tipos, constantes y helpers para Eventos Laborales
 *
 * Incluye lógica de validación según normativa de la DT chilena:
 * - Art. 159 N°4: Término de plazo convenido (restricciones de ventana)
 * - Art. 162: Carta de aviso de término
 * - Art. 177: Finiquito
 */

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export type GuardEventCategory = "ausencia" | "finiquito" | "amonestacion";

export type GuardEventSubtype =
  | "vacaciones"
  | "licencia_medica"
  | "permiso_con_goce"
  | "permiso_sin_goce"
  | "finiquito"
  | "amonestacion_verbal"
  | "amonestacion_escrita"
  | "amonestacion_grave";

export type GuardEventStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ContractType = "plazo_fijo" | "indefinido";

export interface GuardEventAttachment {
  url: string;
  name: string;
  type: string;
  uploadedAt: string;
}

export interface GuardEventDtUpload {
  uploadedAt: string;
  uploadedBy: string;
  evidenceUrl: string;
  notes?: string;
}

export interface GuardEvent {
  id: string;
  tenantId: string;
  guardiaId: string;
  category: GuardEventCategory;
  subtype: GuardEventSubtype;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  finiquitoDate: string | null;
  status: GuardEventStatus;
  causalDtCode: string | null;
  causalDtLabel: string | null;
  // Finiquito financial fields
  vacationDaysPending: number | null;
  vacationPaymentAmount: number | null;
  pendingRemunerationAmount: number | null;
  yearsOfServiceAmount: number | null;
  substituteNoticeAmount: number | null;
  totalSettlementAmount: number | null;
  // Content
  reason: string | null;
  internalNotes: string | null;
  attachments: GuardEventAttachment[];
  metadata: Record<string, unknown>;
  // Audit
  createdBy: string;
  createdByName?: string | null;
  approvedBy: string | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  documents?: GuardEventDocument[];
}

export interface GuardEventDocument {
  id: string;
  documentId: string;
  title: string;
  status: "generated" | "sent" | "signed" | "uploaded_dt";
  templateName?: string;
  createdAt: string;
  sentAt?: string | null;
  sentTo?: string | null;
}

export interface CausalDt {
  id: string;
  code: string;
  article: string;
  number: string;
  label: string;
  fullText: string | null;
  isActive: boolean;
  defaultTemplateId: string | null;
  requiresNoticeWindow?: boolean;
}

export interface GuardContract {
  contractType: ContractType;
  contractStartDate: string | null;
  contractPeriod1End: string | null;
  contractPeriod2End: string | null;
  contractPeriod3End: string | null;
  contractCurrentPeriod: number;
  contractBecameIndefinidoAt: string | null;
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const EVENT_CATEGORIES: {
  value: GuardEventCategory;
  label: string;
  description: string;
}[] = [
  { value: "ausencia", label: "Ausencia", description: "Vacaciones, licencias médicas, permisos" },
  { value: "finiquito", label: "Finiquito", description: "Término de contrato / desvinculación" },
  { value: "amonestacion", label: "Amonestación", description: "Amonestaciones verbales, escritas o graves" },
];

export const EVENT_SUBTYPES: Record<
  GuardEventCategory,
  { value: GuardEventSubtype; label: string; shiftCode?: string }[]
> = {
  ausencia: [
    { value: "vacaciones", label: "Vacaciones", shiftCode: "V" },
    { value: "licencia_medica", label: "Licencia médica", shiftCode: "L" },
    { value: "permiso_con_goce", label: "Permiso con goce de sueldo", shiftCode: "P" },
    { value: "permiso_sin_goce", label: "Permiso sin goce de sueldo", shiftCode: "P" },
  ],
  finiquito: [
    { value: "finiquito", label: "Finiquito / Término" },
  ],
  amonestacion: [
    { value: "amonestacion_verbal", label: "Amonestación verbal" },
    { value: "amonestacion_escrita", label: "Amonestación escrita" },
    { value: "amonestacion_grave", label: "Amonestación grave" },
  ],
};

export const EVENT_STATUS_CONFIG: Record<
  GuardEventStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  draft: { label: "Borrador", variant: "secondary" },
  pending: { label: "Pendiente", variant: "warning" },
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "Rechazado", variant: "destructive" },
  cancelled: { label: "Anulado", variant: "outline" },
};

export const DOC_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  generated: { label: "Generado", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  signed: { label: "Firmado", variant: "success" },
  uploaded_dt: { label: "Subido a DT", variant: "success" },
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  plazo_fijo: "Plazo Fijo",
  indefinido: "Indefinido",
};

/**
 * Máximo de renovaciones para contrato a plazo fijo (Código del Trabajo)
 * Después de 2 renovaciones, se convierte en indefinido automáticamente.
 */
export const MAX_RENEWALS = 2;

/**
 * Máximo plazo de un contrato a plazo fijo: 1 año (365 días).
 * Puede ser desde 1 día hasta 1 año.
 */
export const MAX_FIXED_TERM_DAYS = 365;

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Get the subtype label */
export function getSubtypeLabel(subtype: GuardEventSubtype): string {
  for (const cat of Object.values(EVENT_SUBTYPES)) {
    const found = cat.find((s) => s.value === subtype);
    if (found) return found.label;
  }
  return subtype;
}

/** Get the category label */
export function getCategoryLabel(category: GuardEventCategory): string {
  return EVENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** Calculate total days between two dates (inclusive) */
export function calcTotalDays(startDate: string, endDate: string | null): number | null {
  if (!endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1; // inclusive
}

/** Whether status allows editing */
export function isEditable(status: GuardEventStatus): boolean {
  return status === "draft" || status === "pending";
}

/** Whether status allows approval */
export function isApprovable(status: GuardEventStatus): boolean {
  return status === "pending";
}

/** Whether status allows cancellation */
export function isCancellable(status: GuardEventStatus): boolean {
  return status === "approved" || status === "pending";
}

/** Format a date-only value using UTC to avoid timezone shift */
export function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Format currency in CLP */
export function formatCLP(amount: number | null | undefined): string {
  if (amount == null) return "$0";
  return `$${amount.toLocaleString("es-CL")}`;
}

// ═══════════════════════════════════════════════════════════════
//  CAUSAL 159-4 — Validación de ventana de tiempo
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula la fecha efectiva de fin de contrato según el período actual.
 */
export function getContractEndDate(contract: GuardContract): string | null {
  switch (contract.contractCurrentPeriod) {
    case 3: return contract.contractPeriod3End;
    case 2: return contract.contractPeriod2End;
    case 1: return contract.contractPeriod1End;
    default: return contract.contractPeriod1End;
  }
}

/**
 * Calcula los días calendario entre dos fechas (fecha2 - fecha1).
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Valida si la causal "Término de plazo convenido" (Art. 159 N°4) puede usarse.
 *
 * Reglas (normativa DT):
 * - Solo aplica a contratos a plazo fijo
 * - El finiquito debe hacerse ANTES de la fecha de vencimiento del contrato
 * - Deben faltar 3 o más días para el vencimiento
 * - Si ya venció o faltan menos de 3 días → no se puede usar esta causal
 */
export function validateCausal159N4(
  finiquitoDate: string,
  contract: GuardContract
): { valid: boolean; reason: string } {
  if (contract.contractType !== "plazo_fijo") {
    return { valid: false, reason: "La causal 'Término de plazo convenido' solo aplica a contratos a plazo fijo." };
  }

  const contractEnd = getContractEndDate(contract);
  if (!contractEnd) {
    return { valid: false, reason: "No hay fecha de término de contrato registrada." };
  }

  const daysUntilEnd = daysBetween(finiquitoDate, contractEnd);

  if (daysUntilEnd < 0) {
    return {
      valid: false,
      reason: `El contrato ya venció el ${formatDateUTC(contractEnd)}. No se puede usar esta causal después del vencimiento.`,
    };
  }

  if (daysUntilEnd < 3) {
    return {
      valid: false,
      reason: `Faltan solo ${daysUntilEnd} día(s) para el vencimiento (${formatDateUTC(contractEnd)}). Se requieren al menos 3 días de anticipación para usar esta causal.`,
    };
  }

  return { valid: true, reason: "" };
}

/**
 * Verifica si un contrato a plazo fijo ha expirado y debe convertirse en indefinido.
 * Retorna true si el contrato debería ser indefinido.
 */
export function shouldBecomeIndefinido(contract: GuardContract, today: string = new Date().toISOString().slice(0, 10)): boolean {
  if (contract.contractType !== "plazo_fijo") return false;

  const contractEnd = getContractEndDate(contract);
  if (!contractEnd) return false;

  const daysUntilEnd = daysBetween(today, contractEnd);
  // Si ya pasó la fecha de vencimiento y no se finiquitó, es indefinido
  return daysUntilEnd < 0;
}

/**
 * Calcula cuántas renovaciones quedan disponibles.
 */
export function renewalsRemaining(contract: GuardContract): number {
  return Math.max(0, MAX_RENEWALS - (contract.contractCurrentPeriod - 1));
}

/**
 * Verifica si un contrato puede ser renovado.
 */
export function canRenewContract(contract: GuardContract): boolean {
  if (contract.contractType !== "plazo_fijo") return false;
  return contract.contractCurrentPeriod < MAX_RENEWALS + 1; // max 3 períodos (original + 2 renovaciones)
}

/**
 * Calcula los días hábiles entre dos fechas (excluye sáb/dom).
 */
export function businessDaysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  let count = 0;
  const current = new Date(d1);
  while (current < d2) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * Verifica si se debe enviar alerta de vencimiento de contrato.
 * Retorna true si faltan exactamente N días hábiles para el vencimiento.
 */
export function shouldAlertContractExpiration(
  contract: GuardContract,
  alertDaysBefore: number = 5,
  today: string = new Date().toISOString().slice(0, 10)
): boolean {
  if (contract.contractType !== "plazo_fijo") return false;

  const contractEnd = getContractEndDate(contract);
  if (!contractEnd) return false;

  const bDays = businessDaysBetween(today, contractEnd);
  return bDays <= alertDaysBefore && bDays > 0;
}

// ═══════════════════════════════════════════════════════════════
//  SEED DATA — Causales DT (Código del Trabajo Chile)
// ═══════════════════════════════════════════════════════════════

export const CAUSALES_DT: (Omit<CausalDt, "id" | "defaultTemplateId"> & { requiresNoticeWindow?: boolean })[] = [
  { code: "159-1", article: "Art. 159", number: "N° 1", label: "Mutuo acuerdo de las partes", fullText: null, isActive: true },
  { code: "159-2", article: "Art. 159", number: "N° 2", label: "Renuncia del trabajador", fullText: null, isActive: true },
  { code: "159-3", article: "Art. 159", number: "N° 3", label: "Muerte del trabajador", fullText: null, isActive: true },
  { code: "159-4", article: "Art. 159", number: "N° 4", label: "Vencimiento del plazo convenido", fullText: null, isActive: true, requiresNoticeWindow: true },
  { code: "159-5", article: "Art. 159", number: "N° 5", label: "Conclusión del trabajo o servicio", fullText: null, isActive: true },
  { code: "159-6", article: "Art. 159", number: "N° 6", label: "Caso fortuito o fuerza mayor", fullText: null, isActive: true },
  { code: "160-1", article: "Art. 160", number: "N° 1", label: "Conductas indebidas de carácter grave", fullText: null, isActive: true },
  { code: "160-2", article: "Art. 160", number: "N° 2", label: "Negociaciones prohibidas por contrato", fullText: null, isActive: true },
  { code: "160-3", article: "Art. 160", number: "N° 3", label: "No concurrencia sin causa justificada", fullText: null, isActive: true },
  { code: "160-4", article: "Art. 160", number: "N° 4", label: "Abandono del trabajo", fullText: null, isActive: true },
  { code: "160-5", article: "Art. 160", number: "N° 5", label: "Actos, omisiones o imprudencias temerarias", fullText: null, isActive: true },
  { code: "160-6", article: "Art. 160", number: "N° 6", label: "Perjuicio material causado intencionalmente", fullText: null, isActive: true },
  { code: "160-7", article: "Art. 160", number: "N° 7", label: "Incumplimiento grave de las obligaciones", fullText: null, isActive: true },
  { code: "161-1", article: "Art. 161", number: "Inc. 1°", label: "Necesidades de la empresa", fullText: null, isActive: true },
  { code: "161-2", article: "Art. 161", number: "Inc. 2°", label: "Desahucio escrito del empleador", fullText: null, isActive: true },
];
