import { ACTION_LABELS } from "../CrmActivityTimeline";
import type { TimelineEntry } from "./DealTimelineRow";

/** Fuentes cliente-side del timeline unificado del deal (sin fetch). */
export type SystemEvent = {
  id: string;
  action: string;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};
export type FollowUpEntry = {
  id: string;
  sequence: number;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
};

export function monthLabel(value: string): string {
  const d = new Date(value);
  const m = d.toLocaleDateString("es-CL", { month: "long" });
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}

function followUpTitle(status: string): string {
  if (status === "sent") return "enviado";
  if (status === "failed") return "fallido";
  if (status === "paused") return "pausado";
  if (status === "cancelled") return "cancelado";
  return "programado";
}

/** Fusiona eventos de sistema + seguimientos en entradas ordenadas desc. */
export function buildDealTimelineEntries(
  activityEvents: SystemEvent[],
  followUpLogs: FollowUpEntry[]
): TimelineEntry[] {
  const system: TimelineEntry[] = activityEvents.map((e) => ({
    id: `sys-${e.id}`,
    kind: "system",
    title:
      ACTION_LABELS[e.action] ||
      e.action.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    subtitle: e.createdByName
      ? `por ${e.createdByName}`
      : e.createdBy === "system"
        ? "por Sistema"
        : undefined,
    createdAt: e.createdAt,
  }));
  const followups: TimelineEntry[] = followUpLogs.map((l) => ({
    id: `fu-${l.id}`,
    kind: "followup",
    title: `Seguimiento S${l.sequence} · ${followUpTitle(l.status)}`,
    createdAt: l.sentAt || l.scheduledAt || l.createdAt,
  }));
  return [...system, ...followups].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
