/**
 * Sync Google v2 (B5): un CalendarEvent se materializa como
 * - evento en el calendario del organizador con attendees[] = internos con
 *   Google + externos (RSVP nativo, sendUpdates:"all"), link role:"organizer";
 * - link PENDING role:"attendee_copy" por cada interno SIN cuenta, que se
 *   convierte en copia cuando conecte (retryPendingCalendarV2Links);
 * - lectura de responseStatus de attendees de vuelta a participantes/externos.
 * Idempotencia por @@unique([eventId, provider, providerAccountId]).
 */
import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import { buildCalendarEventGooglePayload, pendingAccountKey } from "./calendar-google-payload";
import { applyAttendeeResponses } from "./calendar-rsvp-readback";

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
    select: { id: true, userId: true, googleEmail: true },
  });
  const accountByUser = new Map(accounts.map((a) => [a.userId, a]));

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

  const client = await getCalendarClientForUser(tenantId, organizer.userId);
  if (!client) return { syncStatus: "PENDING" };
  const { calendar, accountId, calendarId } = client;

  const linkKey = {
    eventId_provider_providerAccountId: {
      eventId: event.id,
      provider: "google",
      providerAccountId: accountId,
    },
  };
  const link = await prisma.calendarProviderLink.findUnique({ where: linkKey });

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
    if (link) {
      await prisma.calendarProviderLink.update({
        where: { id: link.id },
        data: { syncStatus: "ERROR", lastError: msg.slice(0, 500), lastSyncAt: new Date() },
      });
    }
    console.warn("[calendar-v2] syncCalendarEventToGoogle error:", msg);
    return { syncStatus: "ERROR" };
  }
}
