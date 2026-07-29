/**
 * Sync Google v2 (B5): un CalendarEvent se materializa como
 * - evento en el calendario del organizador con attendees[] = internos con
 *   Google + externos (RSVP nativo, sendUpdates:"all"), link role:"organizer";
 * - link PENDING role:"attendee_copy" por cada interno SIN cuenta, que se
 *   convierte en copia cuando conecte (retryPendingCalendarV2Links);
 * - lectura de responseStatus de attendees de vuelta a participantes/externos.
 * Idempotencia por @@unique([eventId, provider, providerAccountId]).
 *
 * Multicuentas: si ya existe un link organizer con providerEventId, se actualiza
 * SIEMPRE en esa cuenta. Nunca se recrea en otra aunque cambie el default.
 */
import { prisma } from "@/lib/prisma";
import {
  getCalendarClientForAccount,
  getCalendarClientForUser,
  pickDefaultAccount,
} from "@/lib/google-workspace/clients";
import { buildCalendarEventGooglePayload, pendingAccountKey } from "./calendar-google-payload";
import { applyAttendeeResponses } from "./calendar-rsvp-readback";
import { resolveCreateTarget } from "./calendar-sources";

/**
 * Clasifica un fallo de push a Google para decidir el estado del link sin
 * revertir jamás el cambio local (la fuente de verdad es OPAI):
 * - PENDING (reintentable): red/timeout/rate-limit/5xx. El evento local ya se
 *   persistió; el cambio se reconcilia en el próximo sync o retry.
 * - ERROR (permanente, no reintentar en bucle): recurso ausente o sin acceso /
 *   request inválido (400/401/403/404/410, "not found", "deleted"). P. ej. un
 *   evento borrado en Google y editado en OPAI falla con "no encontrado".
 */
export function classifyGoogleSyncError(err: unknown): "ERROR" | "PENDING" {
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
  const reason = e?.response?.data?.error?.errors?.[0]?.reason?.toLowerCase() ?? "";
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const haystack = `${reason} ${msg}`;

  // Rate limit / cuota / red: transitorio aunque llegue como 403.
  if (
    status === 429 ||
    status === 408 ||
    /rate|quota|backend error|timeout|timed out|socket|network|econn|etimedout|enotfound|eai_again/.test(
      haystack,
    )
  ) {
    return "PENDING";
  }
  // Recurso ausente / sin acceso / request inválido: permanente.
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 410 ||
    /not ?found|has been deleted|deleted|forbidden|unauthorized|invalid/.test(msg)
  ) {
    return "ERROR";
  }
  // 5xx u otros sin clasificar: transitorio → reintentar.
  return "PENDING";
}

/** Mapa userId → cuenta default (isDefault o más antigua). Determinista. */
function buildAccountByUserMap<
  T extends {
    id: string;
    userId: string;
    googleEmail: string;
    isDefault: boolean;
    createdAt: Date;
    sortIndex: number;
  },
>(accounts: T[]): Map<string, T> {
  const byUser = new Map<string, T[]>();
  for (const a of accounts) {
    const list = byUser.get(a.userId) ?? [];
    list.push(a);
    byUser.set(a.userId, list);
  }
  const result = new Map<string, T>();
  for (const [userId, list] of byUser) {
    const picked = pickDefaultAccount(list, userId);
    if (picked) result.set(userId, picked);
  }
  return result;
}

export async function syncCalendarEventToGoogle(
  tenantId: string,
  eventId: string,
): Promise<{ syncStatus: string }> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, tenantId },
    include: { participants: true, externals: true },
  });
  if (!event) return { syncStatus: "ERROR" };

  const organizer =
    event.participants.find((p) => p.role === "organizer") ??
    event.participants.find((p) => p.role === "owner");
  if (!organizer) return { syncStatus: "PENDING" };

  const internalIds = event.participants.map((p) => p.userId);
  const accounts = await prisma.googleCalendarAccount.findMany({
    where: { tenantId, userId: { in: internalIds }, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      googleEmail: true,
      isDefault: true,
      createdAt: true,
      sortIndex: true,
    },
  });
  const accountByUser = buildAccountByUserMap(accounts);

  // Internos sin Google → link PENDING attendee_copy (se materializa al conectar).
  for (const p of event.participants) {
    if (p.userId === organizer.userId || accountByUser.has(p.userId)) continue;
    await prisma.calendarProviderLink.upsert({
      where: {
        eventId_provider_providerAccountId: {
          eventId: event.id,
          provider: "google",
          providerAccountId: pendingAccountKey(p.userId),
        },
      },
      create: {
        tenantId,
        eventId: event.id,
        provider: "google",
        providerAccountId: pendingAccountKey(p.userId),
        providerCalendarId: "primary",
        role: "attendee_copy",
        syncStatus: "PENDING",
      },
      update: { syncStatus: event.status === "cancelled" ? "CANCELLED" : "PENDING" },
    });
  }

  // Resolver por vínculo existente (no por cuenta default vigente).
  const existingLink = await prisma.calendarProviderLink.findFirst({
    where: {
      tenantId,
      eventId: event.id,
      provider: "google",
      role: "organizer",
      syncStatus: { notIn: ["CANCELLED"] },
      providerEventId: { not: null },
    },
  });

  let accountId: string;
  let calendarId: string;
  let calendar: NonNullable<Awaited<ReturnType<typeof getCalendarClientForUser>>>["calendar"];

  if (existingLink) {
    const client = await getCalendarClientForAccount(
      tenantId,
      existingLink.providerAccountId,
    );
    if (!client) {
      await prisma.calendarProviderLink.update({
        where: { id: existingLink.id },
        data: {
          syncStatus: "ERROR",
          lastError: "Cuenta de Google Calendar del vínculo no está ACTIVE",
          lastSyncAt: new Date(),
        },
      });
      return { syncStatus: "ERROR" };
    }
    accountId = client.accountId;
    calendarId = existingLink.providerCalendarId || client.calendarId;
    calendar = client.calendar;
  } else {
    const target = await resolveCreateTarget({
      tenantId,
      userId: organizer.userId,
    });
    const client = target
      ? await getCalendarClientForAccount(tenantId, target.accountId)
      : await getCalendarClientForUser(tenantId, organizer.userId);
    if (!client) return { syncStatus: "PENDING" };
    accountId = client.accountId;
    calendarId = target?.calendarId ?? client.calendarId;
    calendar = client.calendar;
  }

  const linkKey = {
    eventId_provider_providerAccountId: {
      eventId: event.id,
      provider: "google",
      providerAccountId: accountId,
    },
  };
  const link =
    existingLink ??
    (await prisma.calendarProviderLink.findUnique({ where: linkKey }));

  try {
    if (event.status === "cancelled" || event.deletedAt) {
      if (link?.providerEventId) {
        await calendar.events
          .delete({
            calendarId: link.providerCalendarId,
            eventId: link.providerEventId,
            sendUpdates: "all",
          })
          .catch(() => undefined);
        await prisma.calendarProviderLink.update({
          where: { id: link.id },
          data: { syncStatus: "CANCELLED", lastSyncAt: new Date(), localVersion: event.version },
        });
      }
      return { syncStatus: "CANCELLED" };
    }

    // Attendees: googleEmail de la cuenta default del participante (mapa determinista).
    // Internos sin Google → attendee_copy (no van como attendees nativos).
    const attendeeEmails = event.participants
      .filter((p) => p.userId !== organizer.userId)
      .map((p) => accountByUser.get(p.userId)?.googleEmail)
      .filter((e): e is string => Boolean(e));

    const body = buildCalendarEventGooglePayload(event, attendeeEmails);
    const sendUpdates = body.attendees?.length ? "all" : "none";

    let res;
    if (link?.providerEventId) {
      res = await calendar.events.patch({
        calendarId: link.providerCalendarId,
        eventId: link.providerEventId,
        requestBody: body,
        sendUpdates,
      });
    } else {
      res = await calendar.events.insert({ calendarId, requestBody: body, sendUpdates });
    }

    await prisma.calendarProviderLink.upsert({
      where: linkKey,
      create: {
        tenantId,
        eventId: event.id,
        provider: "google",
        providerAccountId: accountId,
        providerCalendarId: calendarId,
        providerEventId: res.data.id ?? null,
        htmlLink: res.data.htmlLink ?? null,
        role: "organizer",
        syncStatus: "SYNCED",
        etag: res.data.etag ?? null,
        localVersion: event.version,
        lastSyncAt: new Date(),
      },
      update: {
        providerEventId: res.data.id ?? link?.providerEventId ?? null,
        htmlLink: res.data.htmlLink ?? link?.htmlLink ?? null,
        syncStatus: "SYNCED",
        lastError: null,
        etag: res.data.etag ?? null,
        localVersion: event.version,
        lastSyncAt: new Date(),
      },
    });

    await applyAttendeeResponses(tenantId, event, res.data.attendees ?? [], accountByUser);
    return { syncStatus: "SYNCED" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Un fallo remoto nunca revierte el cambio local (ya persistido arriba):
    // transitorio → PENDING (se reintenta), permanente → ERROR (no en bucle).
    const nextStatus = classifyGoogleSyncError(err);
    if (link) {
      await prisma.calendarProviderLink.update({
        where: { id: link.id },
        data: { syncStatus: nextStatus, lastError: msg.slice(0, 500), lastSyncAt: new Date() },
      });
    }
    console.warn(
      `[calendar-v2] syncCalendarEventToGoogle ${nextStatus.toLowerCase()}:`,
      msg,
    );
    return { syncStatus: nextStatus };
  }
}
