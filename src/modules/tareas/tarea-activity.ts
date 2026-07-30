/**
 * Bitácora de seguimiento por tarea (`crm.task_activity`).
 * Distinto de AuditLog (compliance): aquí viven diffs de producto y comentarios.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TaskActivityKind =
  | "created"
  | "completed"
  | "reopened"
  | "due_changed"
  | "priority_changed"
  | "assignees_changed"
  | "comment"
  | "reminder_sent";

export type TaskActivityClient = Prisma.TransactionClient | typeof prisma;

export type LogTaskActivityParams = {
  taskId: string;
  tenantId: string;
  kind: TaskActivityKind;
  actorId?: string | null;
  payload?: Record<string, unknown> | null;
  message?: string | null;
};

/** Inserta un evento. Con `tx` participa de la transacción; sin ella es fire-and-forget seguro. */
export async function logTaskActivity(
  params: LogTaskActivityParams,
  tx?: TaskActivityClient,
): Promise<void> {
  const client = tx ?? prisma;
  const write = () =>
    client.crmTaskActivity.create({
      data: {
        taskId: params.taskId,
        tenantId: params.tenantId,
        kind: params.kind,
        actorId: params.actorId ?? null,
        payload: (params.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        message: params.message ?? null,
      },
    });

  if (tx) {
    await write();
    return;
  }
  try {
    await write();
  } catch (err) {
    console.error("[tarea-activity] log failed:", err);
  }
}
