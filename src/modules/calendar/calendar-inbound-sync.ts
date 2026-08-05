/**
 * Sync Google → OPAI (webhook): lista incremental con paginación, resync ante
 * 410, match por CalendarProviderLink (v2) y AgendaEventLink (legacy).
 * Nunca borra registros locales; cancelación remota → status cancelada.
 */
import { fromZonedTime } from "date-fns-tz";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CHILE_TZ, addDaysChile, startOfDayChile } from "@/lib/dates-cl";
import { getCalendarClientForAccount } from "@/lib/google-workspace/clients";
import { applyAttendeeResponses } from "./calendar-rsvp-readback";
import { classifyGoogleSyncError } from "./calendar-google-sync";
import { recordCalendarAudit } from "./calendar-audit";

export const CALENDAR_INBOUND_SYNC_ENABLED =
  process.env.CALENDAR_INBOUND_SYNC_ENABLED !== "false";

const MAX_PAGES = 10;
const MAX_EVENTS = 200;
const MAX_RESULTS = 250;

type GoogleEvent = {
  id?: string | null;
  status?: string | null;
  etag?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  attendees?: Array<{ email?: string | null; responseStatus?: string | null }> | null;
};

function isFullSyncRequired(err: unknown): boolean {
  const e = err as {
    code?: unknown;
    status?: number;
    response?: {
      status?: number;
      data?: { error?: { errors?: Array<{ reason?: string }> } };
    };
  };
  const status =
    (typeof e?.code === "number" ? e.code : undefined) ??
    e?.status ??
    e?.response?.status;
  const reason = e?.response?.data?.error?.errors?.[0]?.reason ?? "";
  return status === 410 || /fullSyncRequired/i.test(reason);
}

/** Medianoche Chile de un YYYY-MM-DD (componentes locales → fromZonedTime). */
function chileMidnightFromYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), CHILE_TZ);
}

/** All-day Google (`date`) → instantes Chile; timed → Date del ISO. */
export function googleEventBoundsToDates(ev: {
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
}): { startAt: Date; endAt: Date; allDay: boolean } | null {
  const startDate = ev.start?.date;
  const endDate = ev.end?.date;
  if (startDate && endDate) {
    // end.date es exclusivo en Google all-day.
    const startAt = chileMidnightFromYmd(startDate);
    const endExclusiveStart = chileMidnightFromYmd(endDate);
    if (!startAt || !endExclusiveStart) return null;
    const lastInclusive = addDaysChile(endExclusiveStart, -1);
    const endAt = new Date(startOfDayChile(lastInclusive).getTime() + 24 * 60 * 60_000 - 60_000);
    return { startAt, endAt, allDay: true };
  }
  const startDt = ev.start?.dateTime;
  const endDt = ev.end?.dateTime;
  if (startDt && endDt) {
    return { startAt: new Date(startDt), endAt: new Date(endDt), allDay: false };
  }
  return null;
}

async function listEventsPaginated(
  calendar: {
    events: {
      list: (opts: Record<string, unknown>) => Promise<{
        data: {
          items?: GoogleEvent[] | null;
          nextPageToken?: string | null;
          nextSyncToken?: string | null;
        };
      }>;
    };
  },
  calendarId: string,
  opts: {
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
  },
): Promise<{ items: GoogleEvent[]; nextSyncToken?: string }> {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await calendar.events.list({
      calendarId,
      syncToken: opts.syncToken,
      timeMin: opts.syncToken ? undefined : opts.timeMin,
      timeMax: opts.syncToken ? undefined : opts.timeMax,
      singleEvents: true,
      showDeleted: true,
      maxResults: MAX_RESULTS,
      pageToken,
    });
    for (const ev of list.data.items ?? []) {
      items.push(ev);
      if (items.length >= MAX_EVENTS) break;
    }
    if (list.data.nextSyncToken) nextSyncToken = list.data.nextSyncToken;
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken || items.length >= MAX_EVENTS) break;
  }
  return { items, nextSyncToken };
}

async function persistSyncToken(params: {
  tenantId: string;
  accountId: string;
  calendarId: string;
  syncToken: string;
  prefs: Record<string, unknown>;
  fullSync?: boolean;
}): Promise<void> {
  const { tenantId, accountId, calendarId, syncToken, prefs, fullSync } = params;
  await prisma.googleCalendarAccount.update({
    where: { id: accountId },
    data: { prefs: { ...prefs, syncToken } as Prisma.InputJsonValue },
  });
  await prisma.calendarSyncCursor.upsert({
    where: {
      provider_providerAccountId_providerCalendarId: {
        provider: "google",
        providerAccountId: accountId,
        providerCalendarId: calendarId,
      },
    },
    create: {
      tenantId,
      provider: "google",
      providerAccountId: accountId,
      providerCalendarId: calendarId,
      syncToken,
      lastFullSyncAt: fullSync ? new Date() : undefined,
    },
    update: {
      syncToken,
      ...(fullSync ? { lastFullSyncAt: new Date() } : {}),
    },
  });
}

async function clearSyncToken(params: {
  accountId: string;
  calendarId: string;
  prefs: Record<string, unknown>;
}): Promise<void> {
  const { accountId, calendarId, prefs } = params;
  const nextPrefs = { ...prefs };
  delete nextPrefs.syncToken;
  await prisma.googleCalendarAccount.update({
    where: { id: accountId },
    data: { prefs: nextPrefs as Prisma.InputJsonValue },
  });
  await prisma.calendarSyncCursor.updateMany({
    where: {
      provider: "google",
      providerAccountId: accountId,
      providerCalendarId: calendarId,
    },
    data: { syncToken: null },
  });
}

async function applyV2Inbound(
  tenantId: string,
  link: {
    id: string;
    eventId: string;
    etag: string | null;
    localVersion: number;
  },
  ev: GoogleEvent,
): Promise<void> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: link.eventId, tenantId, deletedAt: null },
    include: { participants: true, externals: true },
  });
  if (!event) return;

  // Anti-eco: misma versión local y etag sin cambio → saltar.
  if (link.localVersion === event.version && ev.etag && link.etag === ev.etag) {
    return;
  }

  if (ev.status === "cancelled") {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { status: "cancelled", version: { increment: 1 } },
    });
    await prisma.agendaVisita.updateMany({
      where: { id: event.id, tenantId },
      data: { status: "cancelada" },
    });
    await prisma.calendarProviderLink.update({
      where: { id: link.id },
      data: {
        syncStatus: "CANCELLED",
        etag: ev.etag ?? link.etag,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });
    await recordCalendarAudit({
      tenantId,
      eventId: event.id,
      actorId: null,
      action: "synced_in",
      payload: { source: "google", remoteStatus: "cancelled" },
    });
    return;
  }

  const bounds = googleEventBoundsToDates(ev);
  if (!bounds) return;

  await prisma.calendarEvent.update({
    where: { id: event.id },
    data: {
      title: ev.summary?.trim() || event.title,
      description: ev.description ?? event.description,
      location: ev.location ?? event.location,
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      allDay: bounds.allDay,
      status: "confirmed",
      version: { increment: 1 },
    },
  });

  await prisma.agendaVisita.updateMany({
    where: { id: event.id, tenantId },
    data: {
      title: ev.summary?.trim() || undefined,
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      allDay: bounds.allDay,
      customAddress: ev.location ?? undefined,
      notes: ev.description ?? undefined,
      status: "reprogramada",
    },
  });

  const updated = await prisma.calendarEvent.findFirst({
    where: { id: event.id, tenantId },
    include: { participants: true, externals: true },
  });
  if (updated && ev.attendees?.length) {
    const emailByUser = new Map<string, string>();
    const accounts = await prisma.googleCalendarAccount.findMany({
      where: {
        tenantId,
        userId: { in: updated.participants.map((p) => p.userId) },
        status: "ACTIVE",
      },
      select: { userId: true, googleEmail: true },
    });
    for (const a of accounts) {
      emailByUser.set(a.userId, a.googleEmail.trim().toLowerCase());
    }
    const missing = updated.participants
      .map((p) => p.userId)
      .filter((id) => !emailByUser.has(id));
    if (missing.length) {
      const admins = await prisma.admin.findMany({
        where: { tenantId, id: { in: missing }, status: "active" },
        select: { id: true, email: true },
      });
      for (const a of admins) {
        emailByUser.set(a.id, a.email.trim().toLowerCase());
      }
    }
    await applyAttendeeResponses(tenantId, updated, ev.attendees, emailByUser);
  }

  await prisma.calendarProviderLink.update({
    where: { id: link.id },
    data: {
      syncStatus: "SYNCED",
      etag: ev.etag ?? link.etag,
      lastSyncAt: new Date(),
      lastError: null,
      localVersion: (updated?.version ?? event.version + 1),
    },
  });

  await recordCalendarAudit({
    tenantId,
    eventId: event.id,
    actorId: null,
    action: "synced_in",
    payload: {
      source: "google",
      startAt: bounds.startAt.toISOString(),
      endAt: bounds.endAt.toISOString(),
      allDay: bounds.allDay,
    },
  });
}

async function applyLegacyInbound(
  tenantId: string,
  link: { id: string; sourceId: string; sourceType: string },
  ev: GoogleEvent,
): Promise<void> {
  if (link.sourceType !== "agenda_visita") return;

  if (ev.status === "cancelled") {
    await prisma.agendaVisita.updateMany({
      where: { id: link.sourceId, tenantId },
      data: { status: "cancelada" },
    });
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: { syncStatus: "CANCELLED", lastSyncAt: new Date(), lastError: null },
    });
    return;
  }

  const bounds = googleEventBoundsToDates(ev);
  if (!bounds) return;

  await prisma.agendaVisita.updateMany({
    where: { id: link.sourceId, tenantId },
    data: {
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      allDay: bounds.allDay,
      title: ev.summary?.trim() || undefined,
      customAddress: ev.location ?? undefined,
      notes: ev.description ?? undefined,
      status: "reprogramada",
    },
  });
  await prisma.agendaEventLink.update({
    where: { id: link.id },
    data: { syncStatus: "SYNCED", lastSyncAt: new Date(), lastError: null },
  });
}

export type InboundSyncResult = {
  ok: boolean;
  skipped?: boolean;
  processed?: number;
  reason?: string;
};

/**
 * Procesa una notificación push de Google Calendar para una cuenta ya resuelta.
 */
export async function processGoogleCalendarInbound(params: {
  tenantId: string;
  accountId: string;
  calendarId: string;
  prefs: Record<string, unknown>;
  syncToken?: string | null;
}): Promise<InboundSyncResult> {
  if (!CALENDAR_INBOUND_SYNC_ENABLED) {
    return { ok: true, skipped: true, reason: "disabled" };
  }

  const { tenantId, accountId, calendarId, prefs } = params;
  const client = await getCalendarClientForAccount(tenantId, accountId);
  if (!client) return { ok: true, skipped: true, reason: "no_client" };

  const now = Date.now();
  const timeMin = new Date(now - 30 * 86_400_000).toISOString();
  const timeMax = new Date(now + 180 * 86_400_000).toISOString();

  let syncToken = params.syncToken || undefined;
  let items: GoogleEvent[] = [];
  let nextSyncToken: string | undefined;
  let wasFullSync = !syncToken;

  try {
    const listed = await listEventsPaginated(client.calendar, calendarId, {
      syncToken,
      timeMin,
      timeMax,
    });
    items = listed.items;
    nextSyncToken = listed.nextSyncToken;
  } catch (err) {
    if (isFullSyncRequired(err)) {
      await clearSyncToken({ accountId, calendarId, prefs });
      wasFullSync = true;
      try {
        const listed = await listEventsPaginated(client.calendar, calendarId, {
          timeMin,
          timeMax,
        });
        items = listed.items;
        nextSyncToken = listed.nextSyncToken;
      } catch (retryErr) {
        const status = classifyGoogleSyncError(retryErr);
        console.warn("[google-calendar webhook] resync falló:", status);
        return { ok: false, reason: "resync_failed" };
      }
    } else {
      const status = classifyGoogleSyncError(err);
      console.warn("[google-calendar webhook] list falló:", status);
      return { ok: false, reason: "list_failed" };
    }
  }

  let processed = 0;
  for (const ev of items) {
    if (!ev.id) continue;
    try {
      const v2Link = await prisma.calendarProviderLink.findFirst({
        where: {
          tenantId,
          provider: "google",
          providerEventId: ev.id,
          role: "organizer",
        },
      });
      if (v2Link) {
        await applyV2Inbound(tenantId, v2Link, ev);
        processed += 1;
        continue;
      }

      const legacy = await prisma.agendaEventLink.findFirst({
        where: { tenantId, googleEventId: ev.id },
      });
      if (legacy) {
        await applyLegacyInbound(tenantId, legacy, ev);
        processed += 1;
      }
    } catch (evErr) {
      console.warn(
        "[google-calendar webhook] evento:",
        ev.id?.slice(0, 8),
        evErr instanceof Error ? evErr.message : evErr,
      );
    }
  }

  if (nextSyncToken) {
    await persistSyncToken({
      tenantId,
      accountId,
      calendarId,
      syncToken: nextSyncToken,
      prefs,
      fullSync: wasFullSync,
    });
  }

  return { ok: true, processed };
}

/**
 * Resuelve cuenta por CalendarSyncCursor.channelId (índice) con fallback a prefs.
 * Valida que accountId del token firmado coincida con el cursor/cuenta.
 */
export async function resolveAccountForChannel(params: {
  channelId: string;
  tokenAccountId: string;
  tokenTenantId: string;
}): Promise<{
  tenantId: string;
  accountId: string;
  calendarId: string;
  prefs: Record<string, unknown>;
  syncToken: string | null;
} | null> {
  const { channelId, tokenAccountId, tokenTenantId } = params;

  const cursor = await prisma.calendarSyncCursor.findFirst({
    where: { channelId, provider: "google" },
  });

  if (cursor) {
    if (cursor.providerAccountId !== tokenAccountId || cursor.tenantId !== tokenTenantId) {
      return null;
    }
    const account = await prisma.googleCalendarAccount.findFirst({
      where: { id: cursor.providerAccountId, tenantId: cursor.tenantId, status: "ACTIVE" },
    });
    if (!account) return null;
    const prefs = (account.prefs ?? {}) as Record<string, unknown>;
    return {
      tenantId: cursor.tenantId,
      accountId: account.id,
      calendarId: cursor.providerCalendarId || account.calendarId || "primary",
      prefs,
      syncToken: cursor.syncToken ?? (typeof prefs.syncToken === "string" ? prefs.syncToken : null),
    };
  }

  // Fallback: cuenta del tenant del token con channelId en prefs.
  const account = await prisma.googleCalendarAccount.findFirst({
    where: { id: tokenAccountId, tenantId: tokenTenantId, status: "ACTIVE" },
  });
  if (!account) return null;
  const prefs = (account.prefs ?? {}) as Record<string, unknown>;
  if (prefs.channelId !== channelId) return null;
  return {
    tenantId: account.tenantId,
    accountId: account.id,
    calendarId: account.calendarId || "primary",
    prefs,
    syncToken: typeof prefs.syncToken === "string" ? prefs.syncToken : null,
  };
}

/** Seed inicial de syncToken tras registrar watch (pasada acotada). */
export async function seedCalendarSyncToken(params: {
  tenantId: string;
  accountId: string;
  calendarId: string;
}): Promise<void> {
  const cursor = await prisma.calendarSyncCursor.findFirst({
    where: {
      provider: "google",
      providerAccountId: params.accountId,
      providerCalendarId: params.calendarId,
    },
  });
  if (cursor?.syncToken) return;

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { id: params.accountId, tenantId: params.tenantId, status: "ACTIVE" },
  });
  if (!account) return;
  const prefs = (account.prefs ?? {}) as Record<string, unknown>;
  await processGoogleCalendarInbound({
    tenantId: params.tenantId,
    accountId: params.accountId,
    calendarId: params.calendarId,
    prefs,
    syncToken: null,
  });
}
