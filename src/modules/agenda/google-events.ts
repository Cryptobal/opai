import { prisma } from "@/lib/prisma";
import {
  getCalendarClientForAccount,
  listCalendarAccounts,
} from "@/lib/google-workspace/clients";
import type { calendar_v3 } from "googleapis";
import type { AgendaListItem } from "./agenda.types";
import { isoFromEventDate, isInsufficientScopeError } from "./google-events-helpers";
import {
  googleSourceKey,
  listCalendarSources,
} from "@/modules/calendar/calendar-sources";

export type GoogleAgendaStatus = "ok" | "no_account" | "error" | "missing_scope";
export type GoogleAgendaResult = { items: AgendaListItem[]; status: GoogleAgendaStatus };

const TTL_MS = 5 * 60_000;
const MAX_CALENDARS_PER_ACCOUNT = 6;
const MAX_EVENTS_PER_ACCOUNT = 60;
const MAX_EVENTS_TOTAL = 180;
const cache = new Map<string, { at: number; result: GoogleAgendaResult }>();

type CalMeta = { id: string; summary: string; primary: boolean };
type CalFetch = { items: AgendaListItem[]; scopeError: boolean };

async function listVisibleCalendars(
  calendar: calendar_v3.Calendar,
  allowedIds: Set<string> | null,
): Promise<CalMeta[]> {
  const PRIMARY_ONLY: CalMeta[] = [{ id: "primary", summary: "primary", primary: true }];
  try {
    const res = await calendar.calendarList.list({
      fields: "items(id,summary,selected,accessRole,primary)",
      maxResults: 50,
    });
    const readable = new Set(["owner", "writer", "reader"]);
    let items = (res.data.items ?? []).filter(
      (c) => c.id && c.selected !== false && (!c.accessRole || readable.has(c.accessRole)),
    );
    if (allowedIds) {
      items = items.filter((c) => c.id && allowedIds.has(c.id));
    }
    items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
    const mapped = items.slice(0, MAX_CALENDARS_PER_ACCOUNT).map((c) => ({
      id: c.id!,
      summary: c.summary?.trim() || c.id!,
      primary: !!c.primary,
    }));
    return mapped.length > 0 ? mapped : allowedIds?.has("primary") || !allowedIds ? PRIMARY_ONLY : [];
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      console.warn("[agenda] calendarList sin scope — fallback a primary");
      if (allowedIds && !allowedIds.has("primary")) return [];
      return PRIMARY_ONLY;
    }
    throw err;
  }
}

async function eventsFromCalendar(
  calendar: calendar_v3.Calendar,
  cal: CalMeta,
  from: Date,
  to: Date,
  userId: string,
  accountId: string,
  opaiIds: Set<string | null>,
): Promise<CalFetch> {
  try {
    const res = await calendar.events.list({
      calendarId: cal.id,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: MAX_EVENTS_PER_ACCOUNT,
    });
    const out: AgendaListItem[] = [];
    const sourceKey = googleSourceKey(accountId, cal.id);
    for (const ev of res.data.items ?? []) {
      if (!ev.id || opaiIds.has(ev.id) || ev.status === "cancelled") continue;
      const start = isoFromEventDate(ev.start);
      const end = isoFromEventDate(ev.end);
      if (!start) continue;
      out.push({
        id: `${accountId}:${cal.id}:${ev.id}`,
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
        sourceKey,
      });
    }
    return { items: out, scopeError: false };
  } catch (err) {
    console.error(`[agenda] events.list falló en calendario ${cal.id}:`, err);
    return { items: [], scopeError: isInsufficientScopeError(err) };
  }
}

/** Eventos de todas las cuentas ACTIVE; topes por cuenta + global; cache 5 min. */
export async function listGoogleCalendarEvents(
  tenantId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<GoogleAgendaResult> {
  const accounts = await listCalendarAccounts(tenantId, userId);
  if (!accounts.length) return { items: [], status: "no_account" };

  const sources = await listCalendarSources({ tenantId, userId });
  const visibleGoogle = sources.filter((s) => s.kind === "google" && !s.hidden);
  const visibleByAccount = new Map<string, Set<string>>();
  for (const s of visibleGoogle) {
    if (!s.accountId || !s.calendarId) continue;
    const set = visibleByAccount.get(s.accountId) ?? new Set();
    set.add(s.calendarId);
    visibleByAccount.set(s.accountId, set);
  }

  const calKey = visibleGoogle.map((s) => s.sourceKey).sort().join(",");
  const key = `${tenantId}:${userId}:${from.toISOString()}:${to.toISOString()}:${calKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const [agendaLinks, providerLinks] = await Promise.all([
    prisma.agendaEventLink.findMany({
      where: { tenantId, googleEventId: { not: null } },
      select: { googleEventId: true },
    }),
    prisma.calendarProviderLink.findMany({
      where: { tenantId, provider: "google", providerEventId: { not: null } },
      select: { providerEventId: true },
    }),
  ]);
  const opaiIds = new Set<string | null>([
    ...agendaLinks.map((l) => l.googleEventId),
    ...providerLinks.map((l) => l.providerEventId),
  ]);

  const settled = await Promise.allSettled(
    accounts.map(async (account) => {
      const allowed = visibleByAccount.get(account.id);
      if (!allowed || allowed.size === 0) {
        return { items: [] as AgendaListItem[], scopeHits: 0, calAttempts: 0 };
      }
      const client = await getCalendarClientForAccount(tenantId, account.id);
      if (!client) {
        return { items: [] as AgendaListItem[], scopeHits: 0, calAttempts: 0, accountError: true };
      }
      const calendars = await listVisibleCalendars(client.calendar, allowed);
      const items: AgendaListItem[] = [];
      const seen = new Set<string>();
      let scopeHits = 0;
      let calAttempts = 0;
      for (const cal of calendars) {
        if (items.length >= MAX_EVENTS_PER_ACCOUNT) break;
        calAttempts += 1;
        const batch = await eventsFromCalendar(
          client.calendar,
          cal,
          from,
          to,
          userId,
          account.id,
          opaiIds,
        );
        if (batch.scopeError) scopeHits += 1;
        for (const it of batch.items) {
          const gid = it.googleEventId ?? it.id;
          if (seen.has(gid)) continue;
          seen.add(gid);
          items.push(it);
          if (items.length >= MAX_EVENTS_PER_ACCOUNT) break;
        }
      }
      return { items, scopeHits, calAttempts };
    }),
  );

  const items: AgendaListItem[] = [];
  let totalScopeHits = 0;
  let totalCalAttempts = 0;
  let anyOk = false;
  let allAccountErrors = true;

  for (const result of settled) {
    if (result.status === "rejected") {
      console.error("[agenda] cuenta Google falló:", result.reason);
      continue;
    }
    allAccountErrors = false;
    const { items: batch, scopeHits, calAttempts } = result.value;
    totalScopeHits += scopeHits;
    totalCalAttempts += calAttempts;
    if (calAttempts > 0 && scopeHits < calAttempts) anyOk = true;
    for (const it of batch) {
      items.push(it);
      if (items.length >= MAX_EVENTS_TOTAL) break;
    }
    if (items.length >= MAX_EVENTS_TOTAL) break;
  }

  items.sort((a, b) => a.start.localeCompare(b.start));

  let status: GoogleAgendaStatus = "ok";
  if (allAccountErrors && accounts.length > 0) status = "error";
  else if (totalCalAttempts > 0 && totalScopeHits === totalCalAttempts && !anyOk) {
    status = "missing_scope";
  }

  const result: GoogleAgendaResult = { items, status };
  cache.set(key, { at: Date.now(), result });
  return result;
}
