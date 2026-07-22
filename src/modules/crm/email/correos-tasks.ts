import { prisma } from "@/lib/prisma";

export type ThreadTaskDTO = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  allDay: boolean;
};

/** Tareas asociadas a un hilo de correo (las más abiertas/próximas primero). */
export async function listThreadTasks(tenantId: string, threadId: string): Promise<ThreadTaskDTO[]> {
  const rows = await prisma.crmTask.findMany({
    where: { tenantId, emailThreadId: threadId, status: { not: "cancelled" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, title: true, status: true, dueAt: true, allDay: true },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    // 'notified' (recordatorio ya enviado) sigue siendo pendiente para la UI.
    status: t.status === "notified" || t.status === "notified_no_slack" ? "open" : t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    allDay: t.allDay,
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
  threadId: string;
  title: string;
  dueAt: Date | null;
  allDay?: boolean;
}): Promise<ThreadTaskDTO | null> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, accountId: true, dealId: true, leadId: true, contactId: true },
  });
  if (!thread) return null;
  const t = await prisma.crmTask.create({
    data: {
      tenantId: params.tenantId,
      title: params.title,
      dueAt: params.dueAt,
      allDay: params.dueAt ? Boolean(params.allDay) : false,
      type: params.dueAt ? "reminder" : "followup",
      status: "open",
      assignedTo: params.userId,
      emailThreadId: thread.id,
      accountId: thread.accountId,
      dealId: thread.dealId,
      leadId: thread.leadId,
      contactId: thread.contactId,
    },
    select: { id: true, title: true, status: true, dueAt: true, allDay: true },
  });
  return { id: t.id, title: t.title, status: t.status, dueAt: t.dueAt?.toISOString() ?? null, allDay: t.allDay };
}
