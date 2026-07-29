import { prisma } from "@/lib/prisma";
import {
  getCalendarClientForAccount,
  getCalendarClientForUser,
} from "./clients";
import type { CalendarEventPayload } from "./calendar-payloads";
import { resolveCreateTarget } from "@/modules/calendar/calendar-sources";

export type SyncLinkInput = {
  tenantId: string;
  sourceType: "agenda_visita" | "visita_tecnica" | "licitacion";
  sourceId: string;
  assignedUserId: string;
  allDay?: boolean;
};

/**
 * Crea / actualiza / elimina el evento Google vinculado a un AgendaEventLink (v1).
 * payload=null → delete. Sin cuenta conectada → PENDING sin error.
 *
 * Si el link ya tiene calendarAccountId + googleEventId, usa ESA cuenta.
 * No recrea en otra cuenta si la original fue revocada.
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

  const hasExistingGoogle =
    Boolean(link.calendarAccountId) && Boolean(link.googleEventId);

  let accountId: string;
  let calendarId: string;
  let calendar: NonNullable<
    Awaited<ReturnType<typeof getCalendarClientForUser>>
  >["calendar"];

  if (hasExistingGoogle && link.calendarAccountId) {
    const client = await getCalendarClientForAccount(
      tenantId,
      link.calendarAccountId,
    );
    if (!client) {
      await prisma.agendaEventLink.update({
        where: { id: link.id },
        data: {
          syncStatus: "ERROR",
          lastError: "Cuenta de Google Calendar del vínculo no está ACTIVE",
          lastSyncAt: new Date(),
        },
      });
      return { syncStatus: "ERROR", googleEventId: link.googleEventId };
    }
    accountId = client.accountId;
    calendarId = link.googleCalendarId || client.calendarId;
    calendar = client.calendar;
  } else {
    const target = await resolveCreateTarget({
      tenantId,
      userId: assignedUserId,
    });
    const client = target
      ? await getCalendarClientForAccount(tenantId, target.accountId)
      : await getCalendarClientForUser(tenantId, assignedUserId);
    if (!client) {
      await prisma.agendaEventLink.update({
        where: { id: link.id },
        data: { syncStatus: "PENDING", lastError: null, calendarAccountId: null },
      });
      return { syncStatus: "PENDING" };
    }
    accountId = client.accountId;
    calendarId = target?.calendarId ?? client.calendarId;
    calendar = client.calendar;
  }

  try {
    if (payload === null) {
      if (link.googleEventId) {
        // sendUpdates:"all" — si el evento tenía asistentes, Google les avisa
        // de la cancelación (sin asistentes es un no-op).
        await calendar.events
          .delete({
            calendarId: link.googleCalendarId || calendarId,
            eventId: link.googleEventId,
            sendUpdates: "all",
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
    let htmlLink = link.htmlLink;
    if (googleEventId) {
      const patched = await calendar.events.patch({
        calendarId: link.googleCalendarId || calendarId,
        eventId: googleEventId,
        requestBody: body,
        sendUpdates: payload.attendees?.length ? "all" : "none",
      });
      htmlLink = patched.data.htmlLink ?? htmlLink;
    } else {
      const created = await calendar.events.insert({
        calendarId,
        requestBody: body,
        sendUpdates: payload.attendees?.length ? "all" : "none",
      });
      googleEventId = created.data.id ?? null;
      htmlLink = created.data.htmlLink ?? null;
    }

    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: {
        googleEventId,
        googleCalendarId: calendarId,
        calendarAccountId: accountId,
        htmlLink,
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
