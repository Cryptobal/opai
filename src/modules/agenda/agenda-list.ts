import { prisma } from "@/lib/prisma";
import { todayInChile, utcDateFromYmd, ymdInChile } from "@/lib/dates-cl";
import { expandLicitacionAgendaItems } from "./agenda-list-licitacion";
import { isAgendaVisitaAllDay } from "./agenda-sync";
import { listAgendaTasks } from "./agenda-tasks";
import type { AgendaListItem, LicitacionListItem } from "./agenda.types";
import { opaiSourceKey } from "@/modules/calendar/calendar-sources";

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const ms = utcDateFromYmd(toYmd).getTime() - utcDateFromYmd(fromYmd).getTime();
  return Math.round(ms / 86_400_000);
}

export async function listAgenda(
  tenantId: string,
  from: Date,
  to: Date,
  /** Con userId, incluye las tareas del equipo en la agenda del usuario autenticado. */
  userId?: string,
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
        // @db.Date: comparar por calendario Chile. Sin cota superior: el rango
        // "corriendo" (rangeStartYmd → entrega) puede pisar la ventana aunque
        // la entrega caiga después de `to`.
        fechaEntrega: { gte: utcDateFromYmd(ymdInChile(from)) },
        status: "open",
      },
      include: {
        account: { select: { name: true, ownerId: true } },
      },
    }),
    prisma.agendaEventLink.findMany({
      where: { tenantId },
      select: {
        sourceType: true,
        sourceId: true,
        syncStatus: true,
        rangeStartYmd: true,
        allDay: true,
      },
    }),
    prisma.admin.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const syncMap = new Map(links.map((l) => [`${l.sourceType}:${l.sourceId}`, l.syncStatus]));
  const allDayMap = new Map(
    links
      .filter((l) => l.sourceType === "agenda_visita")
      .map((l) => [l.sourceId, l.allDay === true]),
  );
  const rangeStartMap = new Map(
    links
      .filter((l) => l.sourceType === "licitacion" && l.rangeStartYmd)
      .map((l) => [l.sourceId, l.rangeStartYmd as string]),
  );
  const nameMap = new Map(admins.map((a) => [a.id, a.name]));
  const items: AgendaListItem[] = [];

  for (const v of visitas) {
    const allDay = isAgendaVisitaAllDay(
      v.startAt,
      v.endAt,
      // Solo confiar en el link si ya quedó marcado all-day; si está false
      // (bug legacy del sync), la heurística de duración lo corrige.
      allDayMap.get(v.id) === true ? true : null,
    );
    items.push({
      id: v.id,
      source: "agenda_visita",
      type: v.type as AgendaListItem["type"],
      title: v.title,
      start: v.startAt.toISOString(),
      end: v.endAt.toISOString(),
      allDay,
      assignedUserId: v.assignedUserId,
      assignedName: nameMap.get(v.assignedUserId) ?? null,
      accountName: v.account?.name ?? null,
      installationName: v.installation?.name ?? null,
      address: v.installation?.address ?? null,
      syncStatus: syncMap.get(`agenda_visita:${v.id}`) ?? "PENDING",
      dealId: v.dealId,
      status: v.status,
      sourceKey: opaiSourceKey("cliente"),
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
      sourceKey: opaiSourceKey("tecnica"),
    });
  }

  const fromYmd = ymdInChile(from);
  const toYmdExcl = ymdInChile(to);
  for (const d of deals) {
    if (!d.fechaEntrega) continue;
    const ownerId = d.account.ownerId ?? null;
    items.push(
      ...expandLicitacionAgendaItems({
        deal: {
          id: d.id,
          title: d.title,
          status: d.status,
          fechaEntrega: d.fechaEntrega,
          accountName: d.account.name,
          ownerId,
          ownerName: ownerId ? nameMap.get(ownerId) ?? null : null,
        },
        rangeStartYmd: rangeStartMap.get(d.id) ?? ymdInChile(d.updatedAt),
        fromYmd,
        toYmdExcl,
        syncStatus: syncMap.get(`licitacion:${d.id}`) ?? null,
      }),
    );
  }

  if (userId) {
    items.push(...(await listAgendaTasks(tenantId, from, to)));
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
  const todayYmd = todayInChile();

  return deals.map((d) => {
    const fechaYmd = d.fechaEntrega
      ? d.fechaEntrega.toISOString().slice(0, 10)
      : todayYmd;
    return {
      id: d.id,
      title: d.title,
      accountName: d.account.name,
      amount: Number(d.amount),
      ownerId: d.account.ownerId,
      ownerName: d.account.ownerId ? nameMap.get(d.account.ownerId) ?? null : null,
      fechaEntrega: fechaYmd,
      daysLeft: daysBetweenYmd(todayYmd, fechaYmd),
      syncStatus: syncMap.get(d.id) ?? null,
      stageName: d.stage?.name ?? null,
    };
  });
}
