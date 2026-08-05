/**
 * Vuelca los responseStatus de attendees Google a CalendarEventParticipant
 * (internos, mapeados por email corporativo o googleEmail) y
 * CalendarExternalAttendee (por email).
 */
import { prisma } from "@/lib/prisma";

const VALID = new Set(["needsAction", "accepted", "declined", "tentative"]);

function normalize(status?: string | null): string | null {
  if (!status || !VALID.has(status)) return null;
  return status === "needsAction" ? "needs_action" : status;
}

type EventWithPeople = {
  id: string;
  participants: Array<{ id: string; userId: string; responseStatus: string }>;
  externals: Array<{ id: string; email: string; responseStatus: string }>;
};

/**
 * @param emailByUser mapa userId → email lowercase usado como attendee en Google
 *   (googleEmail de la cuenta conectada, o Admin.email corporativo).
 */
export async function applyAttendeeResponses(
  tenantId: string,
  event: EventWithPeople,
  attendees: Array<{ email?: string | null; responseStatus?: string | null }>,
  emailByUser: Map<string, string>,
): Promise<void> {
  if (!attendees.length) return;
  const byEmail = new Map<string, string>();
  for (const a of attendees) {
    const status = normalize(a.responseStatus);
    if (a.email && status) byEmail.set(a.email.toLowerCase(), status);
  }
  if (!byEmail.size) return;

  for (const p of event.participants) {
    const email = emailByUser.get(p.userId)?.toLowerCase();
    const status = email ? byEmail.get(email) : undefined;
    if (status && status !== p.responseStatus) {
      await prisma.calendarEventParticipant.update({
        where: { id: p.id },
        data: { responseStatus: status, respondedAt: new Date() },
      });
    }
  }
  for (const ext of event.externals) {
    const status = byEmail.get(ext.email.toLowerCase());
    if (status && status !== ext.responseStatus) {
      await prisma.calendarExternalAttendee.update({
        where: { id: ext.id },
        data: { responseStatus: status },
      });
    }
  }
}
