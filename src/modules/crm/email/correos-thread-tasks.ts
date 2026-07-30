/**
 * Agregación de tareas abiertas por hilo (listado de correos).
 * Una query groupBy por página — sin N+1.
 */

import { prisma } from "@/lib/prisma";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import { OPEN_TASK_STATUSES } from "@/modules/tareas/tareas.service";

export type TaskDueLevel = "overdue" | "today" | "upcoming" | null;

export type ThreadTaskAgg = {
  openTaskCount: number;
  taskDueLevel: TaskDueLevel;
};

export function dueLevelFromMinDue(
  minDue: Date | null | undefined,
  now: Date = new Date(),
): TaskDueLevel {
  if (!minDue) return null;
  const dueYmd = ymdInChile(minDue);
  const today = todayInChile(now);
  if (dueYmd < today) return "overdue";
  if (dueYmd === today) return "today";
  return "upcoming";
}

/** Batch: map threadId → { openTaskCount, taskDueLevel }. */
export async function loadThreadTaskAgg(
  tenantId: string,
  threadIds: string[],
): Promise<Map<string, ThreadTaskAgg>> {
  const map = new Map<string, ThreadTaskAgg>();
  if (threadIds.length === 0) return map;

  const rows = await prisma.crmTask.groupBy({
    by: ["emailThreadId"],
    where: {
      tenantId,
      emailThreadId: { in: threadIds },
      status: { in: [...OPEN_TASK_STATUSES] },
    },
    _count: { _all: true },
    _min: { dueAt: true },
  });

  for (const r of rows) {
    if (!r.emailThreadId) continue;
    map.set(r.emailThreadId, {
      openTaskCount: r._count._all,
      taskDueLevel: dueLevelFromMinDue(r._min.dueAt),
    });
  }
  return map;
}

/** Ids de hilos del tenant con al menos una tarea abierta (filtro withTasks). */
export async function findThreadIdsWithOpenTasks(tenantId: string): Promise<string[]> {
  const rows = await prisma.crmTask.findMany({
    where: {
      tenantId,
      emailThreadId: { not: null },
      status: { in: [...OPEN_TASK_STATUSES] },
    },
    distinct: ["emailThreadId"],
    select: { emailThreadId: true },
  });
  return rows
    .map((r) => r.emailThreadId)
    .filter((id): id is string => typeof id === "string");
}
