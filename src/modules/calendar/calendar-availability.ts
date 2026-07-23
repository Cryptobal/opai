/**
 * Free/busy combinado (B6): eventos v2 + visitas/técnicas/tareas legacy +
 * freebusy de Google por usuario conectado (best-effort, timeout corto).
 */
import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import { mergeBusyIntervals, type BusyInterval } from "./calendar-intervals";

const GOOGLE_FREEBUSY_TIMEOUT_MS = 3500;

export type UserAvailability = { userId: string; busy: BusyInterval[]; hasGoogle: boolean };

export async function getUsersBusy(
  tenantId: string,
  userIds: string[],
  from: Date,
  to: Date,
): Promise<UserAvailability[]> {
  const [v2, visitas, tecnicas, tareas] = await Promise.all([
    prisma.calendarEventParticipant.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        responseStatus: { not: "declined" },
        event: {
          deletedAt: null,
          status: { in: ["confirmed", "tentative"] },
          transparency: { not: "free" },
          startAt: { lt: to },
          endAt: { gt: from },
        },
      },
      select: {
        userId: true,
        event: { select: { id: true, title: true, startAt: true, endAt: true, allDay: true } },
      },
    }),
    prisma.agendaVisita.findMany({
      where: {
        tenantId,
        assignedUserId: { in: userIds },
        status: { in: ["programada", "reprogramada"] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { id: true, title: true, assignedUserId: true, startAt: true, endAt: true },
    }),
    prisma.opsVisitaTecnica.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        status: "programada",
        scheduledAt: { gte: new Date(from.getTime() - 60 * 60_000), lt: to },
      },
      select: { id: true, userId: true, scheduledAt: true },
    }),
    prisma.crmTask.findMany({
      where: {
        tenantId,
        assignedTo: { in: userIds },
        status: { notIn: ["done", "cancelled"] },
        allDay: false,
        dueAt: { gte: from, lt: to },
      },
      select: { id: true, title: true, assignedTo: true, dueAt: true },
      take: 200,
    }),
  ]);

  const byUser = new Map<string, BusyInterval[]>(userIds.map((id) => [id, []]));
  const push = (userId: string, slot: BusyInterval) => byUser.get(userId)?.push(slot);

  // v2: el espejo comparte id con AgendaVisita — dedupe por id de evento.
  const v2Ids = new Set<string>();
  for (const p of v2) {
    if (p.event.allDay) continue;
    v2Ids.add(p.event.id);
    push(p.userId, { start: p.event.startAt, end: p.event.endAt, title: p.event.title });
  }
  for (const v of visitas) {
    if (v2Ids.has(v.id)) continue;
    push(v.assignedUserId, { start: v.startAt, end: v.endAt, title: v.title });
  }
  for (const t of tecnicas) {
    if (!t.scheduledAt) continue;
    push(t.userId, {
      start: t.scheduledAt,
      end: new Date(t.scheduledAt.getTime() + 60 * 60_000),
      title: "Visita técnica",
    });
  }
  for (const t of tareas) {
    if (!t.dueAt || !t.assignedTo) continue;
    push(t.assignedTo, {
      start: t.dueAt,
      end: new Date(t.dueAt.getTime() + 30 * 60_000),
      title: t.title,
    });
  }

  const googleAccounts = await prisma.googleCalendarAccount.findMany({
    where: { tenantId, userId: { in: userIds }, status: "ACTIVE" },
    select: { userId: true },
  });
  const withGoogle = new Set(googleAccounts.map((a) => a.userId));

  await Promise.all(
    userIds.map(async (userId) => {
      if (!withGoogle.has(userId)) return;
      const google = await googleBusyForUser(tenantId, userId, from, to);
      for (const slot of google) push(userId, slot);
    }),
  );

  return userIds.map((userId) => ({
    userId,
    busy: mergeBusyIntervals(byUser.get(userId) ?? []),
    hasGoogle: withGoogle.has(userId),
  }));
}

/** freebusy.query del primario del usuario. Falla silenciosa → []. */
async function googleBusyForUser(
  tenantId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  try {
    const client = await getCalendarClientForUser(tenantId, userId);
    if (!client) return [];
    const res = await Promise.race([
      client.calendar.freebusy.query({
        requestBody: {
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: client.calendarId }],
        },
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), GOOGLE_FREEBUSY_TIMEOUT_MS),
      ),
    ]);
    if (!res) return [];
    const busy = res.data.calendars?.[client.calendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
  } catch {
    return [];
  }
}
