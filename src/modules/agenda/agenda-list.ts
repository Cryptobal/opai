import { prisma } from "@/lib/prisma";
import type { AgendaListItem, LicitacionListItem } from "./agenda.types";

function daysBetween(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

export async function listAgenda(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<AgendaListItem[]> {
  const [visitas, tecnicas, deals, links, admins] = await Promise.all([
    prisma.agendaVisita.findMany({
      where: {
        tenantId,
        startAt: { lt: to },
        endAt: { gt: from },
        status: { not: "cancelada" },
      },
      include: {
        account: { select: { name: true } },
        installation: { select: { name: true, address: true } },
      },
    }),
    prisma.opsVisitaTecnica.findMany({
      where: {
        tenantId,
        scheduledAt: { gte: from, lt: to },
        status: { in: ["programada", "en_curso", "borrador"] },
      },
      include: {
        account: { select: { name: true } },
        installation: { select: { name: true, address: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.crmDeal.findMany({
      where: {
        tenantId,
        isLicitacion: true,
        fechaEntrega: { gte: from, lt: to },
        status: "open",
      },
      include: {
        account: { select: { name: true, ownerId: true } },
      },
    }),
    prisma.agendaEventLink.findMany({
      where: { tenantId },
      select: { sourceType: true, sourceId: true, syncStatus: true },
    }),
    prisma.admin.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const syncMap = new Map(links.map((l) => [`${l.sourceType}:${l.sourceId}`, l.syncStatus]));
  const nameMap = new Map(admins.map((a) => [a.id, a.name]));
  const items: AgendaListItem[] = [];

  for (const v of visitas) {
    items.push({
      id: v.id,
      source: "agenda_visita",
      type: v.type as AgendaListItem["type"],
      title: v.title,
      start: v.startAt.toISOString(),
      end: v.endAt.toISOString(),
      allDay: false,
      assignedUserId: v.assignedUserId,
      assignedName: nameMap.get(v.assignedUserId) ?? null,
      accountName: v.account?.name ?? null,
      installationName: v.installation?.name ?? null,
      address: v.installation?.address ?? null,
      syncStatus: syncMap.get(`agenda_visita:${v.id}`) ?? "PENDING",
      dealId: v.dealId,
      status: v.status,
    });
  }

  for (const v of tecnicas) {
    if (!v.scheduledAt) continue;
    const end = new Date(v.scheduledAt.getTime() + 60 * 60_000);
    items.push({
      id: v.id,
      source: "visita_tecnica",
      type: "tecnica",
      title: `Visita técnica · ${v.account?.name ?? ""}`.trim(),
      start: v.scheduledAt.toISOString(),
      end: end.toISOString(),
      allDay: false,
      assignedUserId: v.userId,
      assignedName: v.user?.name ?? null,
      accountName: v.account?.name ?? null,
      installationName: v.installation?.name ?? null,
      address: v.installation?.address ?? null,
      syncStatus: syncMap.get(`visita_tecnica:${v.id}`) ?? null,
      dealId: v.dealId,
      status: v.status,
    });
  }

  for (const d of deals) {
    if (!d.fechaEntrega) continue;
    const day = d.fechaEntrega.toISOString().slice(0, 10);
    const ownerId = d.account.ownerId ?? "";
    items.push({
      id: d.id,
      source: "licitacion",
      type: "licitacion",
      title: `ENTREGA · ${d.title}`,
      start: `${day}T00:00:00.000Z`,
      end: `${day}T23:59:59.999Z`,
      allDay: true,
      assignedUserId: ownerId,
      assignedName: ownerId ? nameMap.get(ownerId) ?? null : null,
      accountName: d.account.name,
      installationName: null,
      address: null,
      syncStatus: syncMap.get(`licitacion:${d.id}`) ?? null,
      dealId: d.id,
      status: d.status,
    });
  }

  items.sort((a, b) => a.start.localeCompare(b.start));
  return items;
}

export async function listLicitacionesEnCarpeta(
  tenantId: string,
): Promise<LicitacionListItem[]> {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, isLicitacion: true, status: "open" },
    orderBy: { fechaEntrega: "asc" },
    include: {
      account: { select: { name: true, ownerId: true } },
      stage: { select: { name: true } },
    },
  });
  const links = await prisma.agendaEventLink.findMany({
    where: { tenantId, sourceType: "licitacion" },
    select: { sourceId: true, syncStatus: true },
  });
  const syncMap = new Map(links.map((l) => [l.sourceId, l.syncStatus]));
  const owners = await prisma.admin.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const nameMap = new Map(owners.map((a) => [a.id, a.name]));
  const today = new Date();

  return deals.map((d) => {
    const fecha = d.fechaEntrega ?? today;
    return {
      id: d.id,
      title: d.title,
      accountName: d.account.name,
      amount: Number(d.amount),
      ownerId: d.account.ownerId,
      ownerName: d.account.ownerId ? nameMap.get(d.account.ownerId) ?? null : null,
      fechaEntrega: fecha.toISOString().slice(0, 10),
      daysLeft: daysBetween(new Date(today), new Date(fecha)),
      syncStatus: syncMap.get(d.id) ?? null,
      stageName: d.stage?.name ?? null,
    };
  });
}
