/**
 * Audit log de Productividad (Tareas + Agenda).
 * Las acciones se escriben en AuditLog con prefijos `task.*` y `agenda.*`
 * para filtrarlas en /opai/auditoria-productividad.
 *
 * Delega en el helper canónico `logAudit` para capturar ipAddress/userAgent.
 * Correos ya audita vía audit-email.ts (`email.*`) — no duplicar aquí.
 */
import { logAudit } from "@/lib/audit";

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
  request?: Request;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    userEmail: params.userEmail,
    action: `task.${params.action}`,
    entity: "crm_task",
    entityId: params.taskId,
    details: params.meta,
    request: params.request,
  });
}

export async function auditAgendaAction(params: {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: AgendaAuditAction;
  visitaId: string;
  meta?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    userEmail: params.userEmail,
    action: `agenda.${params.action}`,
    entity: "agenda_visita",
    entityId: params.visitaId,
    details: params.meta,
    request: params.request,
  });
}

/** Prefijos de acciones visibles en la auditoría de Productividad. */
export const PRODUCTIVIDAD_AUDIT_PREFIXES = ["task.", "agenda."] as const;
