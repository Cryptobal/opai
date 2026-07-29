import { prisma } from "@/lib/prisma";
import type { AgendaListItem } from "./agenda.types";

/**
 * Tareas del equipo con fecha dentro de la ventana, como items de agenda.
 * Se muestran junto a visitas/licitaciones en el hub y en la Agenda; el click
 * lleva al origen (correo/negocio) vía `href`, no abre el drawer de visita.
 *
 * Incluye pendientes vencidas (`dueAt < from`): si no, una tarea de día completo
 * "desaparece" de Mi día al cambiar la fecha aunque siga abierta. El hub las
 * reubica en la sección de hoy (carry-forward); el calendario las sigue mostrando
 * en su día original cuando ese día está en el rango visible.
 */
export async function listAgendaTasks(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<AgendaListItem[]> {
  const [tasks, admins] = await Promise.all([
    prisma.crmTask.findMany({
      where: {
        tenantId,
        status: { notIn: ["done", "cancelled"] },
        dueAt: { not: null, lt: to },
        OR: [
          { dueAt: { gte: from, lt: to } },
          { dueAt: { lt: from } },
        ],
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        allDay: true,
        dealId: true,
        accountId: true,
        emailThreadId: true,
        assignedTo: true,
        createdBy: true,
        assignees: { select: { userId: true } },
      },
      take: 500,
    }),
    prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true },
    }),
  ]);
  if (tasks.length === 0) return [];

  const dealIds = [...new Set(tasks.map((t) => t.dealId).filter((v): v is string => Boolean(v)))];
  const accountIds = [...new Set(tasks.map((t) => t.accountId).filter((v): v is string => Boolean(v)))];
  const [deals, accounts] = await Promise.all([
    dealIds.length
      ? prisma.crmDeal.findMany({ where: { tenantId, id: { in: dealIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.crmAccount.findMany({ where: { tenantId, id: { in: accountIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const dealName = new Map(deals.map((d) => [d.id, d.title]));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const adminName = new Map(admins.map((admin) => [admin.id, admin.name]));

  return tasks.map((t) => {
    const start = (t.dueAt as Date).toISOString();
    const href = t.emailThreadId
      ? `/crm/correos?thread=${t.emailThreadId}`
      : t.dealId
        ? `/crm/deals/${t.dealId}`
        : t.accountId
          ? `/crm/accounts/${t.accountId}`
          : null;
    // Fuente de verdad multi-responsable = task_assignees; fallback al
    // assignedTo denormalizado si aún no hay filas (tareas pre-migración).
    const assigneeIds = t.assignees?.length
      ? t.assignees.map((a) => a.userId)
      : t.assignedTo
        ? [t.assignedTo]
        : [];
    const assignedNames = assigneeIds
      .map((id) => adminName.get(id))
      .filter((n): n is string => Boolean(n));
    return {
      id: t.id,
      source: "tarea",
      type: "tarea",
      title: t.title.replace(/^[⏰\s]+/, ""),
      start,
      end: new Date((t.dueAt as Date).getTime() + 30 * 60_000).toISOString(),
      allDay: t.allDay,
      assignedUserId: assigneeIds[0] ?? "",
      assignedName: assigneeIds[0] ? adminName.get(assigneeIds[0]) ?? null : null,
      assignedUserIds: assigneeIds,
      assignedNames,
      accountName: (t.dealId && dealName.get(t.dealId)) || (t.accountId && accName.get(t.accountId)) || null,
      installationName: null,
      address: null,
      syncStatus: null,
      dealId: t.dealId,
      status: "open",
      href,
      createdBy: t.createdBy,
    };
  });
}
