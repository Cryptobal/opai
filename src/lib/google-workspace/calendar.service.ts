import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "./clients";
import type { CalendarEventPayload } from "./calendar-payloads";

export type SyncLinkInput = {
  tenantId: string;
  sourceType: "agenda_visita" | "visita_tecnica" | "licitacion";
  sourceId: string;
  assignedUserId: string;
  allDay?: boolean;
};

/**
 * Crea / actualiza / elimina el evento Google vinculado a un AgendaEventLink.
 * payload=null → delete. Sin cuenta conectada → PENDING sin error.
 */
export async function syncEventLink(
  input: SyncLinkInput,
  payload: CalendarEventPayload | null,
): Promise<{ syncStatus: string; googleEventId?: string | null }> {
  const { tenantId, sourceType, sourceId, assignedUserId, allDay = false } = input;

  let link = await prisma.agendaEventLink.findUnique({
    where: { sourceType_sourceId: { sourceType, sourceId } },
  });

  if (!link) {
    link = await prisma.agendaEventLink.create({
      data: { tenantId, sourceType, sourceId, allDay, syncStatus: "PENDING" },
    });
  }

  const client = await getCalendarClientForUser(tenantId, assignedUserId);
  if (!client) {
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: { syncStatus: "PENDING", lastError: null, calendarAccountId: null },
    });
    return { syncStatus: "PENDING" };
  }

  const { calendar, accountId, calendarId } = client;

  try {
    if (payload === null) {
      if (link.googleEventId) {
        await calendar.events
          .delete({
            calendarId: link.googleCalendarId || calendarId,
            eventId: link.googleEventId,
          })
          .catch(() => undefined);
      }
      await prisma.agendaEventLink.update({
        where: { id: link.id },
        data: {
          syncStatus: "CANCELLED",
          lastSyncAt: new Date(),
          lastError: null,
          calendarAccountId: accountId,
        },
      });
      return { syncStatus: "CANCELLED", googleEventId: link.googleEventId };
    }

    const body = {
      summary: payload.summary,
      description: payload.description,
      location: payload.location,
      start: payload.start,
      end: payload.end,
      attendees: payload.attendees,
      reminders: payload.reminders,
    };

    let googleEventId = link.googleEventId;
    if (googleEventId) {
      await calendar.events.patch({
        calendarId: link.googleCalendarId || calendarId,
        eventId: googleEventId,
        requestBody: body,
      });
    } else {
      const created = await calendar.events.insert({
        calendarId,
        requestBody: body,
        sendUpdates: payload.attendees?.length ? "all" : "none",
      });
      googleEventId = created.data.id ?? null;
    }

    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: {
        googleEventId,
        googleCalendarId: calendarId,
        calendarAccountId: accountId,
        allDay,
        syncStatus: "SYNCED",
        lastSyncAt: new Date(),
        lastError: null,
      },
    });
    return { syncStatus: "SYNCED", googleEventId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: {
        syncStatus: "ERROR",
        lastError: msg.slice(0, 500),
        lastSyncAt: new Date(),
        calendarAccountId: accountId,
      },
    });
    console.warn("[google-workspace] syncEventLink error:", msg);
    return { syncStatus: "ERROR", googleEventId: link.googleEventId };
  }
}
