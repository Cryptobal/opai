/**
 * Agrupaciones por vista (prioridad / responsable / origen) sobre TareaLike.
 */

import { groupTasksByDue } from "./tareas.service";
import {
  byDueThenPriority,
  originKeyFor,
  primaryAssigneeId,
  priorityLabel,
  TAREA_ORIGEN_LABELS,
  type TareaLike,
  type TareaOrigenKey,
  type TareaPriority,
  type TareaVista,
} from "./tarea-priority";

export interface TareaViewGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

export type GroupTasksCtx = {
  assigneeNames?: Record<string, string>;
  now?: Date;
};

function groupByKey<T extends TareaLike>(
  tasks: T[],
  keyOf: (t: T) => string,
  labelOf: (key: string) => string,
  order: string[],
): TareaViewGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    const list = map.get(k) ?? [];
    list.push(t);
    map.set(k, list);
  }
  const keys = order.filter((k) => map.has(k));
  for (const k of map.keys()) {
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.map((key) => ({
    key,
    label: labelOf(key),
    tasks: (map.get(key) ?? []).slice().sort(byDueThenPriority),
  }));
}

/** Agrupa según la vista activa. `fecha` reutiliza `groupTasksByDue`. */
export function groupTasksBy<T extends TareaLike>(
  view: TareaVista,
  tasks: T[],
  ctx: GroupTasksCtx = {},
): TareaViewGroup<T>[] {
  const now = ctx.now ?? new Date();
  if (view === "fecha") {
    return groupTasksByDue(tasks, now).map((g) => ({
      key: g.bucket,
      label: g.label,
      tasks: g.tasks,
    }));
  }
  if (view === "prioridad") {
    return groupByKey(
      tasks,
      (t) =>
        t.priority === "high" || t.priority === "medium" || t.priority === "low"
          ? t.priority
          : "none",
      (k) => priorityLabel(k === "none" ? null : (k as TareaPriority)),
      ["high", "medium", "low", "none"],
    );
  }
  if (view === "responsable") {
    const names = ctx.assigneeNames ?? {};
    return groupByKey(
      tasks,
      (t) => primaryAssigneeId(t) ?? "sin_responsable",
      (k) => (k === "sin_responsable" ? "Sin responsable" : names[k] ?? "Responsable"),
      [],
    );
  }
  return groupByKey(
    tasks,
    (t) => originKeyFor(t),
    (k) => TAREA_ORIGEN_LABELS[k as TareaOrigenKey] ?? k,
    ["mail", "deal", "manual"],
  );
}
