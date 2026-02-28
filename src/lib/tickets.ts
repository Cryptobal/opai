/**
 * Tickets — Tipos, constantes y helpers para el módulo de Tickets
 *
 * Alineado con ETAPA_2_IMPLEMENTACION.md (OpsTicket, OpsTicketCategory, etc.)
 * Entidades lógicas (sin migración de DB todavía).
 *
 * v2: Añade TicketType con cadenas de aprobación configurables por tenant,
 *     doble origen (guardia / interno), y ApprovalRecord por paso.
 */

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export type TicketStatus =
  | "pending_approval"
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "closed"
  | "rejected"
  | "cancelled";

export type TicketApprovalStatus = "pending" | "approved" | "rejected";

export type TicketPriority = "p1" | "p2" | "p3" | "p4";

export type TicketTeam =
  | "postventa"
  | "ops"
  | "rrhh"
  | "inventario"
  | "finanzas"
  | "it_admin";

export type TicketSource = "manual" | "incident" | "portal" | "guard_event" | "system";

export type TicketOrigin = "guard" | "internal" | "both";

export type ApproverType = "group" | "user";

// ── Ticket Type (configurable per tenant) ──

export interface TicketTypeApprovalStep {
  id: string;
  ticketTypeId: string;
  stepOrder: number;
  approverType: ApproverType;
  approverGroupId: string | null; // FK → AdminGroup
  approverUserId: string | null;  // FK → Admin
  label: string; // "Aprobación RRHH"
  isRequired: boolean;
  // Populated
  approverGroupName?: string;
  approverUserName?: string;
}

export interface TicketType {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  origin: TicketOrigin;
  requiresApproval: boolean;
  assignedTeam: TicketTeam;
  defaultPriority: TicketPriority;
  slaHours: number;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  approvalSteps: TicketTypeApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

// ── Legacy TicketCategory (backward compat, maps to TicketType) ──

export interface TicketCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  assignedTeam: TicketTeam;
  defaultPriority: TicketPriority;
  slaHours: number;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
}

// ── Ticket Approval Record ──

export interface TicketApproval {
  id: string;
  ticketId: string;
  stepOrder: number;
  stepLabel: string;
  approverType: ApproverType;
  approverGroupId: string | null;
  approverGroupName?: string | null;
  approverUserId: string | null;
  approverUserName?: string | null;
  decision: TicketApprovalStatus;
  decidedById: string | null;
  decidedByName: string | null;
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

// ── Ticket ──

export interface Ticket {
  id: string;
  tenantId: string;
  code: string; // "TK-202602-0001"
  ticketTypeId: string | null;
  ticketType?: TicketType | null;
  categoryId: string;
  category?: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  title: string;
  description: string | null;
  assignedTeam: TicketTeam;
  assignedTo: string | null;
  assignedToName?: string | null;
  installationId: string | null;
  installationName?: string | null;
  source: TicketSource;
  sourceLogId: string | null;
  sourceGuardEventId: string | null;
  guardiaId: string | null;
  guardiaName?: string | null;
  guardiaRut?: string | null;
  guardiaCode?: string | null;
  reportedBy: string;
  reportedByName?: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionNotes: string | null;
  tags: string[];
  // Approval tracking
  currentApprovalStep: number | null;
  approvalStatus: TicketApprovalStatus | null;
  approvals?: TicketApproval[];
  createdAt: string;
  updatedAt: string;
  // Computed
  commentsCount?: number;
  attachmentsCount?: number;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  userName?: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  commentId: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedBy: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const TICKET_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline"; order: number }
> = {
  pending_approval: { label: "Pendiente aprobación", variant: "secondary", order: -1 },
  open: { label: "Abierto", variant: "warning", order: 0 },
  in_progress: { label: "En progreso", variant: "default", order: 1 },
  waiting: { label: "En espera", variant: "secondary", order: 2 },
  resolved: { label: "Resuelto", variant: "success", order: 3 },
  closed: { label: "Cerrado", variant: "outline", order: 4 },
  rejected: { label: "Rechazado", variant: "destructive", order: 5 },
  cancelled: { label: "Cancelado", variant: "destructive", order: 6 },
};

export const APPROVAL_STATUS_CONFIG: Record<
  TicketApprovalStatus,
  { label: string; variant: "default" | "secondary" | "success" | "destructive" }
> = {
  pending: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "Rechazado", variant: "destructive" },
};

export const TICKET_PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; shortLabel: string; color: string; bg: string; border: string; description: string }
> = {
  p1: { label: "P1 — Crítica", shortLabel: "P1", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", description: "Requiere atención inmediata" },
  p2: { label: "P2 — Alta", shortLabel: "P2", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", description: "Resolver dentro de SLA" },
  p3: { label: "P3 — Media", shortLabel: "P3", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", description: "Planificable" },
  p4: { label: "P4 — Baja", shortLabel: "P4", color: "text-muted-foreground", bg: "bg-muted/10", border: "border-muted/30", description: "Cuando sea posible" },
};

export const TICKET_TEAM_CONFIG: Record<TicketTeam, { label: string }> = {
  postventa: { label: "Postventa" },
  ops: { label: "Operaciones" },
  rrhh: { label: "RRHH" },
  inventario: { label: "Inventario" },
  finanzas: { label: "Finanzas" },
  it_admin: { label: "IT / Admin" },
};

export const TICKET_SOURCE_CONFIG: Record<TicketSource, { label: string }> = {
  manual: { label: "Manual" },
  incident: { label: "Incidente postventa" },
  portal: { label: "Portal guardia" },
  guard_event: { label: "Evento laboral" },
  system: { label: "Sistema" },
};

// ═══════════════════════════════════════════════════════════════
//  SEED DATA — Legacy Categories (backward compat)
// ═══════════════════════════════════════════════════════════════

export const TICKET_CATEGORIES_SEED: Omit<TicketCategory, "id">[] = [
  { slug: "incidente_operacional", name: "Incidente operacional", description: "Problema en terreno que requiere acción operativa", assignedTeam: "postventa", defaultPriority: "p2", slaHours: 24, icon: "AlertTriangle", isActive: true, sortOrder: 1 },
  { slug: "novedad_instalacion", name: "Novedad de instalación", description: "Observación o requerimiento de una instalación", assignedTeam: "postventa", defaultPriority: "p3", slaHours: 72, icon: "MapPin", isActive: true, sortOrder: 2 },
  { slug: "ausencia_reemplazo_urgente", name: "Ausencia / Reemplazo urgente", description: "Guardia ausente y necesita reemplazo inmediato", assignedTeam: "ops", defaultPriority: "p1", slaHours: 2, icon: "ShieldAlert", isActive: true, sortOrder: 3 },
  { slug: "solicitud_rrhh", name: "Solicitud RRHH", description: "Solicitud general a recursos humanos", assignedTeam: "rrhh", defaultPriority: "p3", slaHours: 72, icon: "Users", isActive: true, sortOrder: 4 },
  { slug: "permiso_vacaciones_licencia", name: "Permiso / Vacaciones / Licencia", description: "Solicitud de ausencia laboral", assignedTeam: "rrhh", defaultPriority: "p2", slaHours: 48, icon: "CalendarDays", isActive: true, sortOrder: 5 },
  { slug: "uniforme_implementos", name: "Uniforme / Implementos", description: "Solicitud de uniforme, equipo o implementos", assignedTeam: "inventario", defaultPriority: "p3", slaHours: 72, icon: "Package", isActive: true, sortOrder: 6 },
  { slug: "activo_danado_perdido", name: "Activo dañado o perdido", description: "Reporte de equipo dañado, perdido o robado", assignedTeam: "inventario", defaultPriority: "p2", slaHours: 48, icon: "AlertOctagon", isActive: true, sortOrder: 7 },
  { slug: "pago_turno_extra", name: "Pago turno extra", description: "Consulta o reclamo sobre pago de turno extra", assignedTeam: "finanzas", defaultPriority: "p2", slaHours: 48, icon: "Banknote", isActive: true, sortOrder: 8 },
  { slug: "conducta_disciplina", name: "Conducta / Disciplina", description: "Reporte de conducta o situación disciplinaria", assignedTeam: "rrhh", defaultPriority: "p2", slaHours: 48, icon: "Gavel", isActive: true, sortOrder: 9 },
  { slug: "soporte_plataforma", name: "Soporte plataforma", description: "Problema técnico con la plataforma", assignedTeam: "it_admin", defaultPriority: "p3", slaHours: 72, icon: "Monitor", isActive: true, sortOrder: 10 },
];

// ═══════════════════════════════════════════════════════════════
//  SEED DATA — Ticket Types with approval chains
// ═══════════════════════════════════════════════════════════════

/**
 * Seed ticket types: each has an origin (guard/internal/both),
 * whether it requires approval, and a default approval chain
 * referencing group slugs (resolved to IDs at seed time).
 */
export interface TicketTypeSeed {
  slug: string;
  name: string;
  description: string;
  origin: TicketOrigin;
  requiresApproval: boolean;
  assignedTeam: TicketTeam;
  defaultPriority: TicketPriority;
  slaHours: number;
  icon: string;
  /** Group slugs for default approval chain (in order) */
  approvalChainGroupSlugs: string[];
  /** Action to execute when full approval chain completes */
  onApprovalAction?: string;
}

export const TICKET_TYPE_SEEDS: TicketTypeSeed[] = [
  // ── Guard-origin tickets ──
  {
    slug: "solicitud_vacaciones",
    name: "Solicitud de vacaciones",
    description: "El guardia solicita días de vacaciones",
    origin: "guard",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p3",
    slaHours: 48,
    icon: "Palmtree",
    approvalChainGroupSlugs: ["rrhh", "operaciones"],
  },
  {
    slug: "solicitud_permiso_con_goce",
    name: "Permiso con goce de sueldo",
    description: "El guardia solicita un permiso remunerado",
    origin: "guard",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p2",
    slaHours: 48,
    icon: "CalendarDays",
    approvalChainGroupSlugs: ["rrhh", "operaciones"],
  },
  {
    slug: "solicitud_permiso_sin_goce",
    name: "Permiso sin goce de sueldo",
    description: "El guardia solicita un permiso no remunerado",
    origin: "guard",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p2",
    slaHours: 48,
    icon: "CalendarDays",
    approvalChainGroupSlugs: ["rrhh"],
  },
  {
    slug: "aviso_licencia_medica",
    name: "Licencia médica (aviso)",
    description: "El guardia notifica presentación de licencia médica",
    origin: "guard",
    requiresApproval: false,
    assignedTeam: "rrhh",
    defaultPriority: "p2",
    slaHours: 24,
    icon: "Stethoscope",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "reclamo_pago",
    name: "Reclamo de sueldo / pago",
    description: "Consulta o reclamo sobre liquidación o pago",
    origin: "guard",
    requiresApproval: false,
    assignedTeam: "finanzas",
    defaultPriority: "p3",
    slaHours: 72,
    icon: "Banknote",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "problema_instalacion",
    name: "Problema en instalación",
    description: "El guardia reporta un problema en su lugar de trabajo",
    origin: "guard",
    requiresApproval: false,
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 24,
    icon: "AlertTriangle",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "solicitud_uniforme_equipo",
    name: "Solicitud de uniforme / equipo",
    description: "El guardia solicita uniforme, implementos o equipamiento",
    origin: "guard",
    requiresApproval: false,
    assignedTeam: "inventario",
    defaultPriority: "p4",
    slaHours: 72,
    icon: "Package",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "solicitud_general_guardia",
    name: "Solicitud general",
    description: "Otro tipo de solicitud del guardia",
    origin: "guard",
    requiresApproval: false,
    assignedTeam: "rrhh",
    defaultPriority: "p3",
    slaHours: 72,
    icon: "MessageSquare",
    approvalChainGroupSlugs: [],
  },
  // ── Internal-origin tickets ──
  {
    slug: "cambio_instalacion",
    name: "Cambio de instalación de guardia",
    description: "Solicitar traslado de un guardia a otra instalación",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 48,
    icon: "MapPin",
    approvalChainGroupSlugs: ["operaciones", "gerencia"],
  },
  {
    slug: "cambio_pauta",
    name: "Cambio de pauta mensual",
    description: "Solicitar modificación a la pauta de un guardia",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 48,
    icon: "CalendarDays",
    approvalChainGroupSlugs: ["operaciones"],
  },
  {
    slug: "desvinculacion",
    name: "Desvinculación / Finiquito",
    description: "Solicitar la desvinculación de un guardia",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p1",
    slaHours: 24,
    icon: "FileWarning",
    approvalChainGroupSlugs: ["rrhh", "gerencia"],
  },
  {
    slug: "solicitar_amonestacion",
    name: "Solicitar amonestación",
    description: "Solicitar aplicar una amonestación a un guardia",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p2",
    slaHours: 48,
    icon: "ShieldAlert",
    approvalChainGroupSlugs: ["rrhh", "operaciones"],
  },
  {
    slug: "cambio_sueldo",
    name: "Cambio de sueldo",
    description: "Solicitar ajuste salarial de un guardia",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "rrhh",
    defaultPriority: "p1",
    slaHours: 72,
    icon: "DollarSign",
    approvalChainGroupSlugs: ["rrhh", "finanzas", "gerencia"],
  },
  {
    slug: "ausencia_reemplazo",
    name: "Ausencia / Reemplazo urgente",
    description: "Guardia ausente, necesita reemplazo inmediato",
    origin: "internal",
    requiresApproval: false,
    assignedTeam: "ops",
    defaultPriority: "p1",
    slaHours: 2,
    icon: "ShieldAlert",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "incidente_operacional",
    name: "Incidente operacional",
    description: "Problema en terreno que requiere acción inmediata",
    origin: "internal",
    requiresApproval: false,
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 24,
    icon: "AlertTriangle",
    approvalChainGroupSlugs: [],
  },
  {
    slug: "soporte_plataforma",
    name: "Soporte plataforma",
    description: "Problema técnico con la plataforma OPAI",
    origin: "both",
    requiresApproval: false,
    assignedTeam: "it_admin",
    defaultPriority: "p3",
    slaHours: 72,
    icon: "Monitor",
    approvalChainGroupSlugs: [],
  },
  // ── Turno de refuerzo (con aprobación + acción automática) ──
  {
    slug: "turno_refuerzo",
    name: "Solicitud de turno de refuerzo",
    description: "Solicitar turno de refuerzo con aprobación, pago guardia y facturación automática",
    origin: "internal",
    requiresApproval: true,
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 24,
    icon: "ShieldPlus",
    approvalChainGroupSlugs: ["operaciones", "finanzas"],
    onApprovalAction: "create_turno_extra",
  },
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Generate next ticket code */
export function generateTicketCode(sequence: number): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `TK-${ym}-${String(sequence).padStart(4, "0")}`;
}

/** Check if SLA is breached */
export function isSlaBreached(
  slaDueAt: string | null,
  status?: TicketStatus,
  resolvedAt?: string | null,
): boolean {
  if (!slaDueAt) return false;
  const terminalStatuses: TicketStatus[] = ["resolved", "closed", "rejected", "cancelled"];
  if (status && terminalStatuses.includes(status)) {
    // For resolved/closed tickets, compare resolvedAt against slaDueAt
    if (resolvedAt) {
      return new Date(resolvedAt) > new Date(slaDueAt);
    }
    // Cancelled/rejected without resolvedAt: SLA no longer applies
    return false;
  }
  return new Date() > new Date(slaDueAt);
}

/** Get time remaining for SLA (human readable) */
export function getSlaRemaining(
  slaDueAt: string | null,
  status?: TicketStatus,
  resolvedAt?: string | null,
): string | null {
  if (!slaDueAt) return null;
  const terminalStatuses: TicketStatus[] = ["resolved", "closed", "rejected", "cancelled"];
  if (status && terminalStatuses.includes(status)) {
    // For resolved tickets, show whether SLA was met or not
    if (resolvedAt) {
      const due = new Date(slaDueAt);
      const resolved = new Date(resolvedAt);
      if (resolved > due) return "Vencido";
    }
    // Resolved within SLA or cancelled/rejected: don't show SLA remaining
    return null;
  }
  const due = new Date(slaDueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return "Vencido";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

/** Whether a ticket can be transitioned to a given status */
export function canTransitionTo(current: TicketStatus, target: TicketStatus): boolean {
  const transitions: Record<TicketStatus, TicketStatus[]> = {
    pending_approval: ["cancelled"], // approval flow handles open/rejected
    open: ["in_progress", "waiting", "resolved", "cancelled"],
    in_progress: ["waiting", "resolved", "cancelled"],
    waiting: ["in_progress", "resolved", "cancelled"],
    resolved: ["closed", "in_progress"], // reopen
    closed: [],
    rejected: ["open"], // can re-open a rejected ticket
    cancelled: [],
  };
  return transitions[current]?.includes(target) ?? false;
}

/** Statuses considered "active" (not terminal) */
export function isActiveStatus(status: TicketStatus): boolean {
  return ["pending_approval", "open", "in_progress", "waiting"].includes(status);
}

/** Check if a ticket is awaiting a specific user's approval (by their group memberships) */
export function isPendingMyApproval(
  ticket: Ticket,
  userGroupIds: string[],
  userId: string,
): boolean {
  if (ticket.status !== "pending_approval" || !ticket.approvals) return false;
  const currentStep = ticket.approvals.find(
    (a) => a.stepOrder === ticket.currentApprovalStep && a.decision === "pending",
  );
  if (!currentStep) return false;
  if (currentStep.approverType === "user") {
    return currentStep.approverUserId === userId;
  }
  return currentStep.approverGroupId != null && userGroupIds.includes(currentStep.approverGroupId);
}

/** Get the origin label */
export function getOriginLabel(origin: TicketOrigin): string {
  const labels: Record<TicketOrigin, string> = {
    guard: "Guardia",
    internal: "Interno",
    both: "Ambos",
  };
  return labels[origin];
}

/**
 * Get SLA percentage remaining (0-100).
 * Returns null for tickets without SLA or in terminal states.
 */
export function getSlaPercentage(
  slaDueAt: string | null,
  createdAt: string,
  status?: TicketStatus,
  resolvedAt?: string | null,
): number | null {
  if (!slaDueAt) return null;
  const terminalStatuses: TicketStatus[] = ["resolved", "closed", "rejected", "cancelled"];
  if (status && terminalStatuses.includes(status)) return null;

  const due = new Date(slaDueAt).getTime();
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const total = due - created;
  if (total <= 0) return 0;
  const remaining = due - now;
  if (remaining <= 0) return 0;
  return Math.min(100, Math.round((remaining / total) * 100));
}

/** Get color class for SLA bar based on percentage */
export function getSlaColor(percentage: number | null): string {
  if (percentage === null) return "bg-muted-foreground/30";
  if (percentage <= 0) return "bg-red-500";
  if (percentage < 30) return "bg-red-500";
  if (percentage < 60) return "bg-yellow-500";
  return "bg-emerald-500";
}

/** Get text color class for SLA */
export function getSlaTextColor(percentage: number | null): string {
  if (percentage === null) return "text-muted-foreground";
  if (percentage <= 0) return "text-red-500";
  if (percentage < 30) return "text-red-500";
  if (percentage < 60) return "text-yellow-500";
  return "text-emerald-500";
}

/** Get border-left color class for priority */
export function getPriorityBorderColor(priority: TicketPriority): string {
  const map: Record<TicketPriority, string> = {
    p1: "border-l-red-500",
    p2: "border-l-orange-500",
    p3: "border-l-yellow-500",
    p4: "border-l-muted-foreground/30",
  };
  return map[priority];
}
