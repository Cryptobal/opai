import type { TaskActivityKind } from "@/modules/tareas/tarea-activity";

export type TareaActivityRow = {
  id: string;
  kind: TaskActivityKind | string;
  payload: Record<string, unknown> | null;
  message: string | null;
  actorId: string | null;
  createdAt: string;
};

export function formatActivityChile(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

export function activityKindLabel(
  row: TareaActivityRow,
  nameById: Map<string, string>,
): string {
  const who = row.actorId ? nameById.get(row.actorId) : null;
  const prefix = who ? `${who} · ` : "";
  switch (row.kind) {
    case "created": return `${prefix}Creó la tarea`;
    case "completed": return `${prefix}Completó la tarea`;
    case "reopened": return `${prefix}Reabrió la tarea`;
    case "due_changed": return `${prefix}Cambió el vencimiento`;
    case "priority_changed": return `${prefix}Cambió la prioridad`;
    case "assignees_changed": return `${prefix}Cambió responsables`;
    case "reminder_sent": return `${prefix}Recordatorio enviado`;
    case "comment": return row.message?.trim() || `${prefix}Comentario`;
    default: return `${prefix}${row.kind}`;
  }
}
