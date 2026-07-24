/**
 * Audit log de Productividad (Tareas + Agenda).
 * Las acciones se escriben en AuditLog con prefijos `task.*` y `agenda.*`
 * para filtrarlas en /opai/auditoria-productividad.
 *
 * Correos ya audita vía audit-email.ts (`email.*`) — no duplicar aquí.
 */
import { prisma } from "@/lib/prisma";

export type TaskAuditAction = "created" | "updated" | "deleted" | "completed" | "reopened";

export type AgendaAuditAction =
  | "created"
  | "reprogrammed"
  | "completed"
  | "cancelled";

export async function auditTaskAction(params: {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: TaskAuditAction;
  taskId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? undefined,
        userEmail: params.userEmail ?? undefined,
        action: `task.${params.action}`,
        entity: "crm_task",
        entityId: params.taskId,
        details: (params.meta as never) ?? undefined,
      },
    });
  } catch (error) {
    console.error("[audit-productividad] task action failed", {
      action: params.action,
      taskId: params.taskId,
      error,
    });
  }
}

export async function auditAgendaAction(params: {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: AgendaAuditAction;
  visitaId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? undefined,
        userEmail: params.userEmail ?? undefined,
        action: `agenda.${params.action}`,
        entity: "agenda_visita",
        entityId: params.visitaId,
        details: (params.meta as never) ?? undefined,
      },
    });
  } catch (error) {
    console.error("[audit-productividad] agenda action failed", {
      action: params.action,
      visitaId: params.visitaId,
      error,
    });
  }
}

/** Prefijos de acciones visibles en la auditoría de Productividad. */
export const PRODUCTIVIDAD_AUDIT_PREFIXES = ["task.", "agenda."] as const;
