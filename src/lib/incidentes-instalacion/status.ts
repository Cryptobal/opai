import type { TicketStatus } from "@/lib/tickets";

export type IncidenteListFilter =
  | "por_validar"
  | "pendientes"
  | "activos"
  | "validados"
  | "abiertos"
  | "all";

export type IncidenteUiStatus = "nuevo" | "en_atencion" | "por_validar" | "validado";

export type IncidenteStatusTone = "info" | "warn" | "ok" | "neutral";

export type IncidenteStatusView = {
  id: IncidenteUiStatus;
  label: string;
  tone: IncidenteStatusTone;
  ticketStatus: TicketStatus;
};

export const INCIDENTE_STATUS_VIEWS: Record<IncidenteUiStatus, IncidenteStatusView> = {
  nuevo: { id: "nuevo", label: "Nuevo", tone: "info", ticketStatus: "open" },
  en_atencion: { id: "en_atencion", label: "En atención", tone: "warn", ticketStatus: "in_progress" },
  por_validar: { id: "por_validar", label: "Cerrado · por validar", tone: "ok", ticketStatus: "resolved" },
  validado: { id: "validado", label: "Validado", tone: "neutral", ticketStatus: "closed" },
};

export function incidenteUiStatus(ticketStatus: string): IncidenteUiStatus {
  if (ticketStatus === "in_progress" || ticketStatus === "waiting") return "en_atencion";
  if (ticketStatus === "resolved") return "por_validar";
  if (ticketStatus === "closed") return "validado";
  return "nuevo";
}

export function incidenteStatusView(ticketStatus: string): IncidenteStatusView {
  return INCIDENTE_STATUS_VIEWS[incidenteUiStatus(ticketStatus)];
}

/**
 * `por_validar` stays resolved-only (ficha de instalación).
 * Supervisión uses `pendientes` so a QR nuevo is actionable immediately.
 */
export function statusesForFilter(filter: IncidenteListFilter): string[] | undefined {
  if (filter === "pendientes") return ["open", "in_progress", "resolved"];
  if (filter === "por_validar") return ["resolved"];
  if (filter === "activos") return ["open", "in_progress"];
  if (filter === "validados") return ["closed"];
  if (filter === "abiertos") return ["open"];
  return undefined;
}

/** Transiciones propias del flujo incidente (no alteran la máquina global). */
export function canIncidenteTransitionTo(
  current: TicketStatus,
  target: TicketStatus,
): boolean {
  const allowed: Record<string, TicketStatus[]> = {
    open: ["in_progress", "cancelled"],
    in_progress: ["resolved", "cancelled"],
    waiting: ["in_progress", "resolved", "cancelled"],
    resolved: ["in_progress", "closed"],
    closed: [],
    cancelled: [],
    rejected: [],
    pending_approval: ["cancelled"],
  };
  return allowed[current]?.includes(target) ?? false;
}

export function formatElapsedMinutes(from: Date | string, to: Date | string): string {
  const a = typeof from === "string" ? new Date(from).getTime() : from.getTime();
  const b = typeof to === "string" ? new Date(to).getTime() : to.getTime();
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 1) return "menos de 1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}
