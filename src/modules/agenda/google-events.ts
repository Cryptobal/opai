import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import type { calendar_v3 } from "googleapis";
import type { AgendaListItem } from "./agenda.types";
import { isoFromEventDate, isInsufficientScopeError } from "./google-events-helpers";

export type GoogleAgendaStatus = "ok" | "no_account" | "error" | "missing_scope";
export type GoogleAgendaResult = { items: AgendaListItem[]; status: GoogleAgendaStatus };

const TTL_MS = 5 * 60_000;
const MAX_CALENDARS = 6;
const MAX_EVENTS = 60;
const cache = new Map<string, { at: number; result: GoogleAgendaResult }>();

type CalMeta = { id: string; summary: string; primary: boolean };
type CalFetch = { items: AgendaListItem[]; scopeError: boolean };

async function listVisibleCalendars(calendar: calendar_v3.Calendar): Promise<CalMeta[]> {
  const res = await calendar.calendarList.list({
    fields: "items(id,summary,selected,accessRole,primary)",
    maxResults: 50,
  });
  const readable = new Set(["owner", "writer", "reader"]);
  const items = (res.data.items ?? []).filter(
    (c) => c.id && c.selected !== false && (!c.accessRole || readable.has(c.accessRole)),
  );
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
): Promise<CalFetch> {
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
    return { items: out, scopeError: false };
  } catch (err) {
    console.error(`[agenda] events.list falló en calendario ${cal.id}:`, err);
    return { items: [], scopeError: isInsufficientScopeError(err) };
  }
}

/** Todos los calendarios visibles; máx. 6 / 60 eventos; dedupe; cache 5 min. */
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
    if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

    const links = await prisma.agendaEventLink.findMany({
      where: { tenantId, googleEventId: { not: null } },
      select: { googleEventId: true },
    });
    const opaiIds = new Set(links.map((l) => l.googleEventId));

    const items: AgendaListItem[] = [];
    const seen = new Set<string>();
    let scopeHits = 0;
    let calAttempts = 0;
    for (const cal of calendars) {
      if (items.length >= MAX_EVENTS) break;
      calAttempts += 1;
      const batch = await eventsFromCalendar(client.calendar, cal, from, to, userId, opaiIds);
      if (batch.scopeError) scopeHits += 1;
      for (const it of batch.items) {
        const gid = it.googleEventId ?? it.id;
        if (seen.has(gid)) continue;
        seen.add(gid);
        items.push(it);
        if (items.length >= MAX_EVENTS) break;
      }
    }
    items.sort((a, b) => a.start.localeCompare(b.start));
    const status: GoogleAgendaStatus =
      calAttempts > 0 && scopeHits === calAttempts ? "missing_scope" : "ok";
    const result: GoogleAgendaResult = { items, status };
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch (err) {
    console.error("[agenda] listGoogleCalendarEvents falló:", err);
    if (isInsufficientScopeError(err)) return { items: [], status: "missing_scope" };
    return { items: [], status: "error" };
  }
}
