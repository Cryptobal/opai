/**
 * Guard Events — Tipos, constantes y helpers para Eventos Laborales
 *
 * Entidades lógicas (sin migración de DB todavía).
 * Se usan en componentes UI + stub API routes.
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
  startDate: string; // ISO date
  endDate: string | null;
  totalDays: number | null;
  isPartialDay: boolean;
  status: GuardEventStatus;
  causalDtCode: string | null;
  causalDtLabel: string | null;
  reason: string | null;
  internalNotes: string | null;
  attachments: GuardEventAttachment[];
  metadata: Record<string, unknown>;
  requestId: string | null;
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
}

export interface GuardRequest {
  id: string;
  tenantId: string;
  guardiaId: string;
  type: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  attachments: GuardEventAttachment[];
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Whether a category requires date range (vs single date) */
export function categoryRequiresDateRange(category: GuardEventCategory): boolean {
  return category === "ausencia" || category === "finiquito";
}

/** Whether a category supports document generation */
export function categorySupportsDocuments(category: GuardEventCategory): boolean {
  return true; // all categories can have associated documents
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

// ═══════════════════════════════════════════════════════════════
//  SEED DATA — Causales DT (Código del Trabajo Chile)
// ═══════════════════════════════════════════════════════════════

export const CAUSALES_DT: Omit<CausalDt, "id" | "defaultTemplateId">[] = [
  { code: "159-1", article: "Art. 159", number: "N° 1", label: "Mutuo acuerdo de las partes", fullText: null, isActive: true },
  { code: "159-2", article: "Art. 159", number: "N° 2", label: "Renuncia del trabajador", fullText: null, isActive: true },
  { code: "159-3", article: "Art. 159", number: "N° 3", label: "Muerte del trabajador", fullText: null, isActive: true },
  { code: "159-4", article: "Art. 159", number: "N° 4", label: "Vencimiento del plazo convenido", fullText: null, isActive: true },
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
