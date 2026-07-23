/**
 * Detalle v2 de un evento para la UI (sheet móvil / inspector): participantes
 * internos con RSVP + si tienen Google conectado, y externos con su estado.
 */
import { prisma } from "@/lib/prisma";

export type CalendarDetailParticipant = {
  userId: string;
  name: string;
  role: string;
  responseStatus: string;
  hasGoogle: boolean;
};

export type CalendarEventDetail = {
  eventId: string;
  status: string;
  participants: CalendarDetailParticipant[];
  externals: Array<{ email: string; name: string | null; responseStatus: string }>;
} | null;

export async function getCalendarEventDetail(
  tenantId: string,
  eventId: string,
): Promise<CalendarEventDetail> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, tenantId },
    include: { participants: true, externals: true },
  });
  if (!event) return null;

  const userIds = event.participants.map((p) => p.userId);
  const [admins, accounts] = await Promise.all([
    userIds.length
      ? prisma.admin.findMany({
          where: { tenantId, id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.googleCalendarAccount.findMany({
          where: { tenantId, userId: { in: userIds }, status: "ACTIVE" },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);
  const nameById = new Map(admins.map((a) => [a.id, a.name]));
  const withGoogle = new Set(accounts.map((a) => a.userId));

  return {
    eventId: event.id,
    status: event.status,
    participants: event.participants.map((p) => ({
      userId: p.userId,
      name: nameById.get(p.userId) ?? "—",
      role: p.role,
      responseStatus: p.responseStatus,
      hasGoogle: withGoogle.has(p.userId),
    })),
    externals: event.externals.map((e) => ({
      email: e.email,
      name: e.name,
      responseStatus: e.responseStatus,
    })),
  };
}
