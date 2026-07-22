import { prisma } from "@/lib/prisma";
import { recordCalendarAudit } from "./calendar-audit";

export type ParticipantRole = "organizer" | "owner" | "required" | "optional" | "watcher";
export type RsvpStatus = "needs_action" | "accepted" | "declined" | "tentative";

/** Agrega (o re-rolifica) participantes internos de un evento. */
export async function addEventParticipants(
  tenantId: string,
  eventId: string,
  participants: Array<{ userId: string; role?: ParticipantRole }>,
  actorId?: string | null,
): Promise<void> {
  for (const p of participants) {
    await prisma.calendarEventParticipant.upsert({
      where: { eventId_userId: { eventId, userId: p.userId } },
      create: {
        tenantId,
        eventId,
        userId: p.userId,
        role: p.role ?? "required",
      },
      update: { role: p.role ?? "required" },
    });
  }
  if (participants.length) {
    await recordCalendarAudit({
      tenantId,
      eventId,
      actorId,
      action: "updated",
      payload: { addedParticipants: participants.map((p) => p.userId) },
    });
  }
}

export async function removeEventParticipant(
  tenantId: string,
  eventId: string,
  userId: string,
  actorId?: string | null,
): Promise<void> {
  await prisma.calendarEventParticipant.deleteMany({
    where: { tenantId, eventId, userId },
  });
  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId,
    action: "updated",
    payload: { removedParticipant: userId },
  });
}

/** RSVP interno de un participante OPAI. */
export async function respondRsvp(
  tenantId: string,
  eventId: string,
  userId: string,
  response: Exclude<RsvpStatus, "needs_action">,
): Promise<boolean> {
  const res = await prisma.calendarEventParticipant.updateMany({
    where: { tenantId, eventId, userId },
    data: { responseStatus: response, respondedAt: new Date() },
  });
  if (res.count === 0) return false;
  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId: userId,
    action: "rsvp",
    payload: { response },
  });
  return true;
}

/**
 * Cambia el dueño (role:"owner") del evento SIN tocar los links de proveedor:
 * el evento Google del organizador se conserva intacto (fix B2).
 * El dueño anterior queda como participante "required".
 */
export async function setEventOwner(
  tenantId: string,
  eventId: string,
  newOwnerId: string,
  actorId?: string | null,
): Promise<void> {
  const current = await prisma.calendarEventParticipant.findMany({
    where: { tenantId, eventId, role: "owner" },
  });
  if (current.some((p) => p.userId === newOwnerId)) return; // no-op: ya es owner
  for (const p of current) {
    if (p.userId !== newOwnerId) {
      await prisma.calendarEventParticipant.update({
        where: { id: p.id },
        data: { role: "required" },
      });
    }
  }
  await prisma.calendarEventParticipant.upsert({
    where: { eventId_userId: { eventId, userId: newOwnerId } },
    create: { tenantId, eventId, userId: newOwnerId, role: "owner" },
    update: { role: "owner" },
  });
  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId,
    action: "reassigned",
    payload: { newOwnerId, previousOwners: current.map((p) => p.userId) },
  });
  try {
    const { notifyCalendarEvent } = await import("./calendar-notify");
    await notifyCalendarEvent({ tenantId, eventId, kind: "invited", actorId });
  } catch (err) {
    console.warn("[calendar-v2] notify reasignación falló:", err);
  }
}
