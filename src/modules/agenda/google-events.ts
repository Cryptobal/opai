import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import type { calendar_v3 } from "googleapis";
import type { AgendaListItem } from "./agenda.types";

export type GoogleAgendaStatus = "ok" | "no_account" | "error";
export type GoogleAgendaResult = { items: AgendaListItem[]; status: GoogleAgendaStatus };

const TTL_MS = 5 * 60_000;
const MAX_CALENDARS = 6;
const MAX_EVENTS = 60;
const cache = new Map<string, { at: number; items: AgendaListItem[] }>();

function isoFromEventDate(dt?: { dateTime?: string | null; date?: string | null } | null) {
  if (dt?.dateTime) return { iso: dt.dateTime, allDay: false };
  if (dt?.date) return { iso: `${dt.date}T00:00:00`, allDay: true };
  return null;
}

type CalMeta = { id: string; summary: string; primary: boolean };

async function listVisibleCalendars(calendar: calendar_v3.Calendar): Promise<CalMeta[]> {
  const res = await calendar.calendarList.list({
    fields: "items(id,summary,selected,accessRole,primary)",
    maxResults: 50,
  });
  const items = (res.data.items ?? []).filter((c) => c.id && c.selected !== false);
  items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
  return items.slice(0, MAX_CALENDARS).map((c) => ({
    id: c.id!,
    summary: c.summary?.trim() || c.id!,
    primary: !!c.primary,
  }));
}

async function eventsFromCalendar(
  calendar: calendar_v3.Calendar,
  cal: CalMeta,
  from: Date,
  to: Date,
  userId: string,
  opaiIds: Set<string | null>,
): Promise<AgendaListItem[]> {
  try {
    const res = await calendar.events.list({
      calendarId: cal.id,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: MAX_EVENTS,
    });
    const out: AgendaListItem[] = [];
    for (const ev of res.data.items ?? []) {
      if (!ev.id || opaiIds.has(ev.id) || ev.status === "cancelled") continue;
      const start = isoFromEventDate(ev.start);
      const end = isoFromEventDate(ev.end);
      if (!start) continue;
      out.push({
        id: `${cal.id}:${ev.id}`,
        source: "google",
        type: "google",
        title: ev.summary?.trim() || "(sin título)",
        start: start.iso,
        end: end?.iso ?? start.iso,
        allDay: start.allDay,
        assignedUserId: userId,
        assignedName: null,
        accountName: null,
        installationName: null,
        address: ev.location ?? null,
        syncStatus: null,
        dealId: null,
        status: "google",
        htmlLink: ev.htmlLink ?? null,
        calendarName: cal.primary ? null : cal.summary,
        googleEventId: ev.id,
      });
    }
    return out;
  } catch (err) {
    console.error(`[agenda] events.list falló en calendario ${cal.id}:`, err);
    return [];
  }
}

/**
 * Eventos de todos los calendarios visibles (selected) de la cuenta conectada.
 * Primary primero, máx. 6 calendarios / 60 eventos. Dedup por googleEventId
 * (links OPAI + entre calendarios). Cache 5 min por usuario+rango+calendarios.
 */
export async function listGoogleCalendarEvents(
  tenantId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<GoogleAgendaResult> {
  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!account) return { items: [], status: "no_account" };

  const client = await getCalendarClientForUser(tenantId, userId);
  if (!client) return { items: [], status: "error" };

  try {
    const calendars = await listVisibleCalendars(client.calendar);
    const calKey = calendars.map((c) => c.id).join(",");
    const key = `${tenantId}:${userId}:${from.toISOString()}:${to.toISOString()}:${calKey}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { items: hit.items, status: "ok" };

    const links = await prisma.agendaEventLink.findMany({
      where: { tenantId, googleEventId: { not: null } },
      select: { googleEventId: true },
    });
    const opaiIds = new Set(links.map((l) => l.googleEventId));

    const items: AgendaListItem[] = [];
    const seen = new Set<string>();
    for (const cal of calendars) {
      if (items.length >= MAX_EVENTS) break;
      const batch = await eventsFromCalendar(client.calendar, cal, from, to, userId, opaiIds);
      for (const it of batch) {
        const gid = it.googleEventId ?? it.id;
        if (seen.has(gid)) continue;
        seen.add(gid);
        items.push(it);
        if (items.length >= MAX_EVENTS) break;
      }
    }
    items.sort((a, b) => a.start.localeCompare(b.start));
    cache.set(key, { at: Date.now(), items });
    return { items, status: "ok" };
  } catch (err) {
    console.error("[agenda] listGoogleCalendarEvents falló:", err);
    return { items: [], status: "error" };
  }
}
