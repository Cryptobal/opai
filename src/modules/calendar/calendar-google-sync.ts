/**
 * Sync Google v2 (B5): un CalendarEvent se materializa como
 * - evento en el calendario del organizador con attendees[] = internos
 *   (googleEmail o Admin.email) + externos (RSVP nativo, sendUpdates:"all"),
 *   link role:"organizer";
 * - link PENDING role:"attendee_copy" solo si el interno no tiene Google ni
 *   email corporativo usable; se convierte en copia cuando conecte;
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
import { recordCalendarAudit } from "./calendar-audit";
import { buildInviteSyncDebugPayload } from "./calendar-invite-sync-debug";
import { buildCalendarEventGooglePayload, pendingAccountKey } from "./calendar-google-payload";
import { applyAttendeeResponses } from "./calendar-rsvp-readback";
import { resolveCreateTarget } from "./calendar-sources";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Precedencia: googleEmail conectado → Admin.email corporativo activo. */
async function buildEmailByUserMap(
  tenantId: string,
  internalIds: string[],
  accountByUser: Map<string, { googleEmail: string }>,
): Promise<Map<string, string>> {
  const emailByUser = new Map<string, string>();
  for (const [userId, acc] of accountByUser) {
    const email = acc.googleEmail?.trim().toLowerCase();
    if (email && EMAIL_RE.test(email)) emailByUser.set(userId, email);
  }
  const missing = internalIds.filter((id) => !emailByUser.has(id));
  if (!missing.length) return emailByUser;

  const admins = await prisma.admin.findMany({
    where: { tenantId, id: { in: missing }, status: "active" },
    select: { id: true, email: true },
  });
  for (const a of admins) {
    const email = a.email?.trim().toLowerCase();
    if (email && EMAIL_RE.test(email)) emailByUser.set(a.id, email);
  }
  return emailByUser;
}

async function ensurePendingOrganizerLink(
  tenantId: string,
  eventId: string,
  organizerUserId: string,
  lastError: string,
): Promise<void> {
  await prisma.calendarProviderLink.upsert({
    where: {
      eventId_provider_providerAccountId: {
        eventId,
        provider: "google",
        providerAccountId: pendingAccountKey(organizerUserId),
      },
    },
    create: {
      tenantId,
      eventId,
      provider: "google",
      providerAccountId: pendingAccountKey(organizerUserId),
      providerCalendarId: "primary",
      role: "organizer",
      syncStatus: "PENDING",
      lastError,
    },
    update: {
      role: "organizer",
      syncStatus: "PENDING",
      lastError,
      lastSyncAt: new Date(),
    },
  });
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
  const emailByUser = await buildEmailByUserMap(tenantId, internalIds, accountByUser);

  // attendee_copy solo si no hay Google ni email corporativo usable.
  // Si ya hay email nativo, cancelar copias PENDING previas para evitar duplicados.
  for (const p of event.participants) {
    if (p.userId === organizer.userId) continue;
    const hasNativeInvite = emailByUser.has(p.userId);
    if (hasNativeInvite) {
      await prisma.calendarProviderLink.updateMany({
        where: {
          tenantId,
          eventId: event.id,
          provider: "google",
          role: "attendee_copy",
          providerAccountId: pendingAccountKey(p.userId),
          syncStatus: "PENDING",
        },
        data: {
          syncStatus: "CANCELLED",
          lastError: "invitado como attendee nativo",
          lastSyncAt: new Date(),
        },
      });
      continue;
    }
    if (accountByUser.has(p.userId)) continue;
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
  // Preferir link materializado; si solo hay PENDING sintético, se trata abajo.
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
    if (!client) {
      await ensurePendingOrganizerLink(
        tenantId,
        event.id,
        organizer.userId,
        "El organizador no tiene Google Calendar conectado",
      );
      return { syncStatus: "PENDING" };
    }
    accountId = client.accountId;
    calendarId = target?.calendarId ?? client.calendarId;
    calendar = client.calendar;

    // Si había link PENDING sintético del organizador, se materializa abajo
    // con la cuenta real (upsert por accountId distinto del pending key).
    const pendingOrg = await prisma.calendarProviderLink.findFirst({
      where: {
        tenantId,
        eventId: event.id,
        provider: "google",
        role: "organizer",
        providerAccountId: pendingAccountKey(organizer.userId),
        syncStatus: "PENDING",
      },
    });
    if (pendingOrg) {
      await prisma.calendarProviderLink.update({
        where: { id: pendingOrg.id },
        data: {
          syncStatus: "CANCELLED",
          lastError: "reemplazado por cuenta Google real",
          lastSyncAt: new Date(),
        },
      });
    }
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

    // Attendees: googleEmail o Admin.email; dedupe lowercase vs externos.
    const externalEmails = new Set(
      event.externals.map((e) => e.email.trim().toLowerCase()).filter(Boolean),
    );
    const nonOrganizerIds = event.participants
      .filter((p) => p.userId !== organizer.userId)
      .map((p) => p.userId);
    const attendeeEmails = Array.from(
      new Set(
        nonOrganizerIds
          .map((id) => emailByUser.get(id))
          .filter((e): e is string => typeof e === "string" && !externalEmails.has(e)),
      ),
    );
    const internalIdsResolvedCount = nonOrganizerIds.filter((id) => emailByUser.has(id)).length;

    const body = buildCalendarEventGooglePayload(event, attendeeEmails);
    const sendUpdates = body.attendees?.length ? "all" : "none";

    // Bloque 0 — pre-push: conteos hasheados (sin correos en claro).
    const preDebug = buildInviteSyncDebugPayload({
      eventId: event.id,
      participantsCount: event.participants.length,
      internalIdsCount: nonOrganizerIds.length,
      internalIdsResolvedCount,
      attendeeEmails,
      externalEmailsCount: externalEmails.size,
      sendUpdates,
    });
    console.info(
      `[calendar-v2] invite-sync pre_push eventId=${preDebug.eventId}` +
        ` participants=${preDebug.participantsCount}` +
        ` resolved=${preDebug.internalIdsResolvedCount}/${preDebug.internalIdsCount}` +
        ` attendeeEmails=${preDebug.attendeeEmailsCount}` +
        ` sendUpdates=${preDebug.sendUpdates}`,
    );

    let res;
    if (link?.providerEventId) {
      try {
        res = await calendar.events.patch({
          calendarId: link.providerCalendarId,
          eventId: link.providerEventId,
          requestBody: body,
          sendUpdates,
        });
      } catch (patchErr) {
        // Cambio all-day ↔ timed: si el cliente omite nulls o el merge falla,
        // update (reemplazo completo de start/end) recupera el evento.
        const patchMsg = (
          patchErr instanceof Error ? patchErr.message : String(patchErr)
        ).toLowerCase();
        if (!/invalid (start|end) time|mismatching start and end/.test(patchMsg)) {
          throw patchErr;
        }
        console.warn(
          `[calendar-v2] patch start/end rechazado (${patchMsg}); reintentando con events.update`,
        );
        res = await calendar.events.update({
          calendarId: link.providerCalendarId,
          eventId: link.providerEventId,
          requestBody: body,
          sendUpdates,
        });
      }
    } else {
      res = await calendar.events.insert({ calendarId, requestBody: body, sendUpdates });
    }

    let googleAttendees = res.data.attendees ?? [];
    const providerEventId = res.data.id ?? link?.providerEventId ?? null;
    const expectedEmails = new Set([
      ...attendeeEmails.map((e) => e.toLowerCase()),
      ...event.externals.map((e) => e.email.trim().toLowerCase()).filter(Boolean),
    ]);
    const returnedEmails = new Set(
      googleAttendees
        .map((a) => (typeof a.email === "string" ? a.email.trim().toLowerCase() : ""))
        .filter(Boolean),
    );
    let missingAttendees = [...expectedEmails].filter((e) => !returnedEmails.has(e));

    // Si faltan invitados en la respuesta del insert/patch, confirmar con events.get.
    if (missingAttendees.length > 0 && providerEventId) {
      try {
        const fresh = await calendar.events.get({
          calendarId: link?.providerCalendarId || calendarId,
          eventId: providerEventId,
        });
        googleAttendees = fresh.data.attendees ?? googleAttendees;
        const freshEmails = new Set(
          googleAttendees
            .map((a) => (typeof a.email === "string" ? a.email.trim().toLowerCase() : ""))
            .filter(Boolean),
        );
        missingAttendees = [...expectedEmails].filter((e) => !freshEmails.has(e));
      } catch {
        // Si get falla, mantenemos missingAttendees del insert/patch.
      }
    }

    const attendeesOk = missingAttendees.length === 0;
    const syncStatus = attendeesOk ? "SYNCED" : "ERROR";
    const lastError = attendeesOk
      ? null
      : `Google no aceptó ${missingAttendees.length} invitado(s). Usá «Reenviar a Google».`;

    const debugPayload = buildInviteSyncDebugPayload({
      eventId: event.id,
      participantsCount: event.participants.length,
      internalIdsCount: nonOrganizerIds.length,
      internalIdsResolvedCount,
      attendeeEmails,
      externalEmailsCount: externalEmails.size,
      sendUpdates,
      googleEventId: providerEventId,
      googleStatus: typeof res.data.status === "string" ? res.data.status : null,
      googleAttendeesReturned: googleAttendees.length,
    });
    console.info(
      `[calendar-v2] invite-sync post_push eventId=${debugPayload.eventId}` +
        ` googleId=${debugPayload.googleEventId ?? "null"}` +
        ` googleStatus=${debugPayload.googleStatus ?? "null"}` +
        ` googleAttendees=${debugPayload.googleAttendeesReturned}` +
        ` sentAttendees=${debugPayload.attendeeEmailsCount}` +
        ` syncStatus=${syncStatus}`,
    );
    await recordCalendarAudit({
      tenantId,
      eventId: event.id,
      action: "synced_out",
      payload: {
        ...(debugPayload as unknown as Record<string, unknown>),
        missingAttendeesCount: missingAttendees.length,
        syncStatus,
      },
    });

    await prisma.calendarProviderLink.upsert({
      where: linkKey,
      create: {
        tenantId,
        eventId: event.id,
        provider: "google",
        providerAccountId: accountId,
        providerCalendarId: calendarId,
        providerEventId,
        htmlLink: res.data.htmlLink ?? null,
        role: "organizer",
        syncStatus,
        lastError,
        etag: res.data.etag ?? null,
        localVersion: event.version,
        lastSyncAt: new Date(),
      },
      update: {
        providerEventId,
        htmlLink: res.data.htmlLink ?? link?.htmlLink ?? null,
        syncStatus,
        lastError,
        etag: res.data.etag ?? null,
        localVersion: event.version,
        lastSyncAt: new Date(),
      },
    });

    await applyAttendeeResponses(tenantId, event, googleAttendees, emailByUser);
    return { syncStatus };
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
    } else {
      await prisma.calendarProviderLink.upsert({
        where: linkKey,
        create: {
          tenantId,
          eventId: event.id,
          provider: "google",
          providerAccountId: accountId,
          providerCalendarId: calendarId,
          role: "organizer",
          syncStatus: nextStatus,
          lastError: msg.slice(0, 500),
          lastSyncAt: new Date(),
        },
        update: {
          syncStatus: nextStatus,
          lastError: msg.slice(0, 500),
          lastSyncAt: new Date(),
        },
      });
    }
    console.warn(
      `[calendar-v2] syncCalendarEventToGoogle ${nextStatus.toLowerCase()}:`,
      msg,
    );
    return { syncStatus: nextStatus };
  }
}
