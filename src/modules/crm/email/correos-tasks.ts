import { prisma } from "@/lib/prisma";
import { auditTaskAction } from "@/lib/audit-productividad";
import { logTaskActivity } from "@/modules/tareas/tarea-activity";

export type ThreadTaskDTO = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  allDay: boolean;
  priority: string | null;
  assignedTo: { id: string; name: string | null } | null;
};

export type ThreadTaskSource = "correo" | "copiloto";

/** Tareas asociadas a un hilo de correo (las más abiertas/próximas primero). */
export async function listThreadTasks(tenantId: string, threadId: string): Promise<ThreadTaskDTO[]> {
  const rows = await prisma.crmTask.findMany({
    where: { tenantId, emailThreadId: threadId, status: { not: "cancelled" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      allDay: true,
      priority: true,
      assignedTo: true,
    },
  });
  const assigneeIds = [
    ...new Set(rows.map((r) => r.assignedTo).filter((id): id is string => Boolean(id))),
  ];
  const admins =
    assigneeIds.length > 0
      ? await prisma.admin.findMany({
          where: { id: { in: assigneeIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(admins.map((a) => [a.id, a.name]));

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    // 'notified' (recordatorio ya enviado) sigue siendo pendiente para la UI.
    status: t.status === "notified" || t.status === "notified_no_slack" ? "open" : t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    allDay: t.allDay,
    priority: t.priority ?? null,
    assignedTo: t.assignedTo
      ? { id: t.assignedTo, name: nameById.get(t.assignedTo) ?? null }
      : null,
  }));
}

/**
 * Crea una tarea desde un correo: hereda cuenta/negocio/contacto del hilo y lo
 * enlaza (emailThreadId) para volver al origen. Con `dueAt` se marca como
 * `reminder` para que el cron de recordatorios (Slack) la entregue al vencer.
 */
export async function createThreadTask(params: {
  tenantId: string;
  userId: string;
  userEmail?: string | null;
  threadId: string;
  title: string;
  dueAt: Date | null;
  allDay?: boolean;
  source?: ThreadTaskSource;
  request?: Request;
}): Promise<ThreadTaskDTO | null> {
  const source: ThreadTaskSource = params.source === "copiloto" ? "copiloto" : "correo";
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, accountId: true, dealId: true, leadId: true, contactId: true },
  });
  if (!thread) return null;
  // Multi-responsable: la fuente de verdad es crm_task_assignees. El Hub y el
  // filtro assigneeId de GET /api/crm/tasks leen esa tabla — sin la fila el
  // creador no ve la tarea en "Mi día" aunque assignedTo quede seteado.
  const t = await prisma.$transaction(async (tx) => {
    const created = await tx.crmTask.create({
      data: {
        tenantId: params.tenantId,
        title: params.title,
        dueAt: params.dueAt,
        allDay: params.dueAt ? Boolean(params.allDay) : false,
        type: params.dueAt ? "reminder" : "followup",
        status: "open",
        assignedTo: params.userId,
        createdBy: params.userId,
        emailThreadId: thread.id,
        accountId: thread.accountId,
        dealId: thread.dealId,
        leadId: thread.leadId,
        contactId: thread.contactId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        allDay: true,
        priority: true,
        assignedTo: true,
      },
    });
    await tx.crmTaskAssignee.createMany({
      data: [{ taskId: created.id, userId: params.userId }],
      skipDuplicates: true,
    });
    await logTaskActivity(
      {
        taskId: created.id,
        tenantId: params.tenantId,
        kind: "created",
        actorId: params.userId,
        payload: { source, threadId: params.threadId },
      },
      tx,
    );
    return created;
  });

  void auditTaskAction({
    tenantId: params.tenantId,
    userId: params.userId,
    userEmail: params.userEmail,
    action: "created",
    taskId: t.id,
    meta: { title: t.title, threadId: params.threadId, assigneeIds: [params.userId] },
    request: params.request,
  });

  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    allDay: t.allDay,
    priority: t.priority ?? null,
    // Nombre no resuelto en create (el cliente ya conoce al creador).
    assignedTo: t.assignedTo ? { id: t.assignedTo, name: null } : null,
  };
}
