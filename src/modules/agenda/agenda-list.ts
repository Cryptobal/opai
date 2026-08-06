import { prisma } from "@/lib/prisma";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import { sanitizeSyncReason } from "./agenda-sync-reason";
import { isAgendaVisitaAllDay } from "./agenda-sync";
import { allDaySpanFromBounds } from "./agenda-all-day-span";
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
  opts?: { dealId?: string | null },
): Promise<AgendaListItem[]> {
  const dealIdFilter = opts?.dealId?.trim() || null;
  // Bandas all-day por fechaEntrega del deal: descontinuadas. La entrega y el
  // cronograma viven como eventos de Agenda del negocio (agenda_visita) y esos
  // sí sincronizan con Google Calendar.
  const [visitas, tecnicas, links, admins, providerLinks] = await Promise.all([
    prisma.agendaVisita.findMany({
      where: {
        tenantId,
        startAt: { lt: to },
        endAt: { gt: from },
        status: { not: "cancelada" },
        ...(dealIdFilter ? { dealId: dealIdFilter } : {}),
      },
      include: {
        account: { select: { name: true } },
        installation: { select: { name: true, address: true } },
      },
    }),
    dealIdFilter
      ? Promise.resolve([])
      : prisma.opsVisitaTecnica.findMany({
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
    prisma.agendaEventLink.findMany({
      where: { tenantId, sourceType: { in: ["agenda_visita", "visita_tecnica"] } },
      select: {
        sourceType: true,
        sourceId: true,
        syncStatus: true,
        lastError: true,
        htmlLink: true,
      },
    }),
    prisma.admin.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
    prisma.calendarProviderLink.findMany({
      where: {
        tenantId,
        provider: "google",
        role: "organizer",
        htmlLink: { not: null },
      },
      select: { eventId: true, htmlLink: true, syncStatus: true, lastError: true },
    }),
  ]);

  const syncMap = new Map(links.map((l) => [`${l.sourceType}:${l.sourceId}`, l.syncStatus]));
  const syncReasonMap = new Map(
    links.map((l) => [`${l.sourceType}:${l.sourceId}`, sanitizeSyncReason(l.lastError)]),
  );
  const htmlLinkMap = new Map(
    links
      .filter((l) => l.htmlLink)
      .map((l) => [`${l.sourceType}:${l.sourceId}`, l.htmlLink as string]),
  );
  for (const pl of providerLinks) {
    if (pl.htmlLink) htmlLinkMap.set(`agenda_visita:${pl.eventId}`, pl.htmlLink);
    if (pl.syncStatus) syncMap.set(`agenda_visita:${pl.eventId}`, pl.syncStatus);
    if (pl.lastError) {
      syncReasonMap.set(`agenda_visita:${pl.eventId}`, sanitizeSyncReason(pl.lastError));
    }
  }
  const nameMap = new Map(admins.map((a) => [a.id, a.name]));
  const items: AgendaListItem[] = [];

  for (const v of visitas) {
    const allDay = isAgendaVisitaAllDay(
      v.startAt,
      v.endAt,
      // Columna propia es fuente; si false y duración ≥23h, heurística legacy.
      v.allDay === true ? true : null,
    );
    const span = allDaySpanFromBounds({
      id: v.id,
      startAt: v.startAt,
      endAt: v.endAt,
      allDay,
    });
    items.push({
      id: v.id,
      source: "agenda_visita",
      type: v.type as AgendaListItem["type"],
      title: v.title,
      label: v.label ?? null,
      start: v.startAt.toISOString(),
      end: v.endAt.toISOString(),
      allDay,
      assignedUserId: v.assignedUserId,
      assignedName: nameMap.get(v.assignedUserId) ?? null,
      accountName: v.account?.name ?? null,
      installationName: v.installation?.name ?? null,
      // Preferir dirección libre del evento; instalación como fallback.
      address: v.customAddress?.trim() || v.installation?.address || null,
      syncStatus: syncMap.get(`agenda_visita:${v.id}`) ?? null,
      syncReason: syncReasonMap.get(`agenda_visita:${v.id}`) ?? null,
      htmlLink: htmlLinkMap.get(`agenda_visita:${v.id}`) ?? null,
      dealId: v.dealId,
      status: v.status,
      sourceKey: opaiSourceKey("cliente"),
      ...(span ?? {}),
    });
  }

  for (const v of tecnicas) {
    if (!v.scheduledAt) continue;
    const end = new Date(v.scheduledAt.getTime() + 60 * 60_000);
    // Chip informativo de solo lectura: sin sync Google ni sourceKey de sync.
    items.push({
      id: v.id,
      source: "visita_tecnica",
      type: "tecnica",
      title: `Visita técnica · ${v.account?.name ?? ""}`.trim(),
      label: "Visita técnica (terreno)",
      start: v.scheduledAt.toISOString(),
      end: end.toISOString(),
      allDay: false,
      assignedUserId: v.userId,
      assignedName: v.user?.name ?? null,
      accountName: v.account?.name ?? null,
      installationName: v.installation?.name ?? null,
      address: v.installation?.address ?? null,
      syncStatus: null,
      dealId: v.dealId,
      status: v.status,
      sourceKey: opaiSourceKey("tecnica"),
    });
  }

  if (userId && !dealIdFilter) {
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
