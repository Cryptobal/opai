/**
 * Materializa las copias pendientes (role:"attendee_copy") de un interno que
 * acaba de conectar Google Calendar: crea el evento-copia en SU calendario y
 * promueve el link PENDING → SYNCED con la cuenta real.
 */
import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import { buildCalendarEventGooglePayload, pendingAccountKey } from "./calendar-google-payload";

const DEFAULT_CAP = 20;

export async function retryPendingCalendarV2Links(
  tenantId: string,
  userId: string,
  cap = DEFAULT_CAP,
): Promise<{ retried: number }> {
  const links = await prisma.calendarProviderLink.findMany({
    where: {
      tenantId,
      provider: "google",
      role: "attendee_copy",
      syncStatus: "PENDING",
      providerAccountId: pendingAccountKey(userId),
    },
    orderBy: { id: "asc" },
    take: cap,
  });
  if (!links.length) return { retried: 0 };

  const client = await getCalendarClientForUser(tenantId, userId);
  if (!client) return { retried: 0 };
  const { calendar, accountId, calendarId } = client;

  let retried = 0;
  for (const link of links) {
    try {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: link.eventId, tenantId, deletedAt: null, status: { not: "cancelled" } },
        include: { externals: true },
      });
      if (!event) {
        await prisma.calendarProviderLink.update({
          where: { id: link.id },
          data: { syncStatus: "CANCELLED", lastSyncAt: new Date() },
        });
        continue;
      }
      // Copia personal: sin attendees (el hilo RSVP vive en el evento del organizador).
      const body = buildCalendarEventGooglePayload({ ...event, externals: [] }, []);
      const res = await calendar.events.insert({ calendarId, requestBody: body });
      await prisma.calendarProviderLink.update({
        where: { id: link.id },
        data: {
          providerAccountId: accountId,
          providerCalendarId: calendarId,
          providerEventId: res.data.id ?? null,
          htmlLink: res.data.htmlLink ?? null,
          syncStatus: "SYNCED",
          lastError: null,
          localVersion: event.version,
          lastSyncAt: new Date(),
        },
      });
      retried += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.calendarProviderLink
        .update({
          where: { id: link.id },
          data: { lastError: msg.slice(0, 500), lastSyncAt: new Date() },
        })
        .catch(() => undefined);
      console.warn("[calendar-v2] retry attendee_copy falló:", link.id, msg);
    }
  }
  return { retried };
}
