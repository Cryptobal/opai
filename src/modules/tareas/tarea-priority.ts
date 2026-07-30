/** Prioridad, origen y comparadores puros para tareas. */

export type TareaPriority = "high" | "medium" | "low" | null;

export const TAREA_PRIORITY_ORDER: TareaPriority[] = ["high", "medium", "low", null];

export const TAREA_PRIORITY_LABELS: Record<"high" | "medium" | "low" | "none", string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
  none: "Sin prioridad",
};

export function priorityLabel(p: TareaPriority | undefined): string {
  if (p === "high" || p === "medium" || p === "low") return TAREA_PRIORITY_LABELS[p];
  return TAREA_PRIORITY_LABELS.none;
}

export function priorityRank(p: TareaPriority | undefined): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  if (p === "low") return 2;
  return 3;
}

export type TareaVista = "fecha" | "prioridad" | "responsable" | "origen";
export type TareaOrigenKey = "mail" | "deal" | "manual";

export const TAREA_ORIGEN_LABELS: Record<TareaOrigenKey, string> = {
  mail: "Correo",
  deal: "Negocio",
  manual: "Manual",
};

export interface TareaLike {
  dueAt: string | null;
  priority?: TareaPriority | string | null;
  emailThreadId?: string | null;
  dealId?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
}

export function byDueThenPriority<T extends TareaLike>(a: T, b: T): number {
  if (a.dueAt && b.dueAt) {
    const d = a.dueAt.localeCompare(b.dueAt);
    if (d !== 0) return d;
  } else if (a.dueAt && !b.dueAt) return -1;
  else if (!a.dueAt && b.dueAt) return 1;
  return (
    priorityRank((a.priority as TareaPriority) ?? null) -
    priorityRank((b.priority as TareaPriority) ?? null)
  );
}

export function originKeyFor(t: TareaLike): TareaOrigenKey {
  if (t.emailThreadId) return "mail";
  if (t.dealId) return "deal";
  return "manual";
}

export function primaryAssigneeId(t: TareaLike): string | null {
  if (t.assigneeIds?.length) return t.assigneeIds[0] ?? null;
  return t.assigneeId ?? null;
}
