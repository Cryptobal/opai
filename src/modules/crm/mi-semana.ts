import { prisma } from "@/lib/prisma";

export type AgendaItem = {
  id: string;
  source: "task" | "compromiso";
  title: string;
  dueAt: string | null;
  context: string | null;
  href: string | null;
};

/** Quita el ⏰ que arrastran los compromisos viejos (el título ya se pinta con su ícono). */
function clean(title: string): string {
  return title.replace(/^[⏰\s]+/, "");
}

/**
 * Agenda comercial del usuario: unifica sus tareas abiertas (de correos y
 * negocios) con los compromisos del Radar que tienen fecha. Devuelve una lista
 * plana ordenada por vencimiento; el cliente la agrupa por día (zona local).
 */
export async function getMiSemana(tenantId: string, userId: string): Promise<AgendaItem[]> {
  const [tasks, compromisos] = await Promise.all([
    prisma.crmTask.findMany({
      where: { tenantId, assignedTo: userId, status: "open" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, title: true, dueAt: true, dealId: true, accountId: true, emailThreadId: true },
    }),
    prisma.crmRadarItem.findMany({
      where: { tenantId, userId, kind: "compromiso", status: "PENDING", dueAt: { not: null } },
      orderBy: { dueAt: "asc" },
      take: 100,
      select: { id: true, title: true, dueAt: true, dealId: true, accountId: true, threadId: true },
    }),
  ]);

  const dealIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const t of [...tasks, ...compromisos]) {
    if (t.dealId) dealIds.add(t.dealId);
    if (t.accountId) accountIds.add(t.accountId);
  }
  const [deals, accounts] = await Promise.all([
    dealIds.size
      ? prisma.crmDeal.findMany({ where: { tenantId, id: { in: [...dealIds] } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    accountIds.size
      ? prisma.crmAccount.findMany({ where: { tenantId, id: { in: [...accountIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const dealName = new Map(deals.map((d) => [d.id, d.title]));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));

  const ctxLabel = (dealId: string | null, accountId: string | null, email: boolean): string | null =>
    (dealId && dealName.get(dealId)) || (accountId && accName.get(accountId)) || (email ? "Correo" : null);

  const link = (threadId: string | null, dealId: string | null, accountId: string | null): string | null => {
    if (threadId) return `/crm/correos?thread=${threadId}`;
    if (dealId) return `/crm/deals/${dealId}`;
    if (accountId) return `/crm/accounts/${accountId}`;
    return null;
  };

  const items: AgendaItem[] = [
    ...tasks.map((t) => ({
      id: t.id,
      source: "task" as const,
      title: clean(t.title),
      dueAt: t.dueAt?.toISOString() ?? null,
      context: ctxLabel(t.dealId, t.accountId, Boolean(t.emailThreadId)),
      href: link(t.emailThreadId, t.dealId, t.accountId),
    })),
    ...compromisos.map((c) => ({
      id: c.id,
      source: "compromiso" as const,
      title: clean(c.title),
      dueAt: c.dueAt?.toISOString() ?? null,
      context: ctxLabel(c.dealId, c.accountId, Boolean(c.threadId)),
      href: link(c.threadId, c.dealId, c.accountId),
    })),
  ];

  items.sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
  return items;
}
