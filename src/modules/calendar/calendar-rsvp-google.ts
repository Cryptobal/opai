/**
 * RSVP del usuario autenticado sobre un evento de su Google Calendar
 * (lookup por iCalUID + patch de attendees[].responseStatus).
 */
import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import { respondRsvp, type RsvpStatus } from "./calendar-participants";

export type GoogleRsvpResponse = Exclude<RsvpStatus, "needs_action">;

export type GoogleRsvpResult =
  | {
      ok: true;
      googleEventId: string;
      htmlLink: string | null;
      responseStatus: GoogleRsvpResponse;
      opaiEventId: string | null;
    }
  | { ok: false; code: "calendar_disconnected" | "event_not_found" | "not_attendee" | "patch_failed"; error: string };

function googleStatus(response: GoogleRsvpResponse): "accepted" | "declined" | "tentative" {
  return response;
}

/** Busca el primer evento no cancelado con ese iCalUID en el calendar del usuario. */
export async function findGoogleEventByIcalUid(
  tenantId: string,
  userId: string,
  icalUid: string,
): Promise<{
  calendar: NonNullable<Awaited<ReturnType<typeof getCalendarClientForUser>>>;
  event: { id: string; htmlLink?: string | null; attendees?: Array<{ email?: string | null; responseStatus?: string | null; self?: boolean | null }> | null; status?: string | null };
  googleEmail: string;
} | null> {
  const client = await getCalendarClientForUser(tenantId, userId);
  if (!client) return null;

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { id: client.accountId },
    select: { googleEmail: true },
  });
  if (!account?.googleEmail) return null;

  const res = await client.calendar.events.list({
    calendarId: client.calendarId,
    iCalUID: icalUid,
    maxResults: 5,
    singleEvents: true,
    showDeleted: false,
  });
  const event = (res.data.items || []).find((e) => e.id && e.status !== "cancelled");
  if (!event?.id) return null;

  return {
    calendar: client,
    event: {
      id: event.id,
      htmlLink: event.htmlLink,
      attendees: event.attendees,
      status: event.status,
    },
    googleEmail: account.googleEmail,
  };
}

/** Lee el responseStatus actual del usuario (self) en el evento Google. */
export function selfResponseFromAttendees(
  attendees: Array<{ email?: string | null; responseStatus?: string | null; self?: boolean | null }> | null | undefined,
  googleEmail: string,
): GoogleRsvpResponse | "needs_action" {
  const email = googleEmail.toLowerCase();
  const mine =
    attendees?.find((a) => a.self) ||
    attendees?.find((a) => (a.email || "").toLowerCase() === email);
  const status = (mine?.responseStatus || "needsAction").toLowerCase();
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (status === "tentative") return "tentative";
  return "needs_action";
}

/**
 * Parchea el responseStatus del attendee = usuario conectado y notifica
 * al organizador (`sendUpdates: "all"`). Si hay espejo OPAI, actualiza RSVP local.
 */
export async function respondGoogleInviteRsvp(params: {
  tenantId: string;
  userId: string;
  icalUid: string;
  response: GoogleRsvpResponse;
}): Promise<GoogleRsvpResult> {
  const { tenantId, userId, icalUid, response } = params;
  const found = await findGoogleEventByIcalUid(tenantId, userId, icalUid);
  if (!found) {
    const client = await getCalendarClientForUser(tenantId, userId);
    if (!client) {
      return { ok: false, code: "calendar_disconnected", error: "Google Calendar no conectado" };
    }
    return {
      ok: false,
      code: "event_not_found",
      error: "El evento no está en tu Google Calendar todavía",
    };
  }

  const { calendar, event, googleEmail } = found;
  const email = googleEmail.toLowerCase();
  const attendees = [...(event.attendees || [])];
  const idx = attendees.findIndex(
    (a) => a.self || (a.email || "").toLowerCase() === email,
  );
  if (idx < 0) {
    // Algunos invites llegan sin attendees[] en la copia del invitado: forzamos self.
    attendees.push({ email: googleEmail, responseStatus: googleStatus(response), self: true });
  } else {
    attendees[idx] = {
      ...attendees[idx],
      email: attendees[idx].email || googleEmail,
      responseStatus: googleStatus(response),
    };
  }

  try {
    await calendar.calendar.events.patch({
      calendarId: calendar.calendarId,
      eventId: event.id,
      requestBody: { attendees },
      sendUpdates: "all",
    });
  } catch (err) {
    console.error("[calendar-rsvp-google] patch failed", err);
    return { ok: false, code: "patch_failed", error: "No se pudo enviar la respuesta a Google Calendar" };
  }

  // Espejo OPAI si el evento ya está linkeado a esta cuenta.
  let opaiEventId: string | null = null;
  const link = await prisma.calendarProviderLink.findFirst({
    where: {
      tenantId,
      provider: "google",
      providerAccountId: calendar.accountId,
      providerEventId: event.id,
    },
    select: { eventId: true },
  });
  if (link) {
    opaiEventId = link.eventId;
    await respondRsvp(tenantId, link.eventId, userId, response).catch(() => false);
  }

  return {
    ok: true,
    googleEventId: event.id,
    htmlLink: event.htmlLink ?? null,
    responseStatus: response,
    opaiEventId,
  };
}
