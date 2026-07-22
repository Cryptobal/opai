import { prisma } from "@/lib/prisma";
import type { AgendaListItem } from "./agenda.types";

/**
 * Tareas del equipo con fecha dentro de la ventana, como items de agenda.
 * Se muestran junto a visitas/licitaciones en el hub y en la Agenda; el click
 * lleva al origen (correo/negocio) vía `href`, no abre el drawer de visita.
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
        dueAt: { gte: from, lt: to },
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
    return {
      id: t.id,
      source: "tarea",
      type: "tarea",
      title: t.title.replace(/^[⏰\s]+/, ""),
      start,
      end: new Date((t.dueAt as Date).getTime() + 30 * 60_000).toISOString(),
      allDay: t.allDay,
      assignedUserId: t.assignedTo ?? "",
      assignedName: t.assignedTo ? adminName.get(t.assignedTo) ?? null : null,
      accountName: (t.dealId && dealName.get(t.dealId)) || (t.accountId && accName.get(t.accountId)) || null,
      installationName: null,
      address: null,
      syncStatus: null,
      dealId: t.dealId,
      status: "open",
      href,
    };
  });
}
