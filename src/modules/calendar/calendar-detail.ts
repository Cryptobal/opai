/**
 * Detalle v2 de un evento para la UI (sheet móvil / inspector): participantes
 * internos con RSVP + vía de invitación Google, y externos con su estado.
 */
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cómo se invita al participante en el push a Google (misma lógica que buildEmailByUserMap). */
export type InvitedVia = "google_account" | "email" | "none";

export type CalendarDetailParticipant = {
  userId: string;
  name: string;
  role: string;
  responseStatus: string;
  /** True si tiene GoogleCalendarAccount ACTIVE (retrocompat). */
  hasGoogle: boolean;
  /** google_account → cuenta ACTIVE; email → Admin.email; none → sin invitar. */
  invitedVia: InvitedVia;
};

export type CalendarEventDetail = {
  eventId: string;
  status: string;
  participants: CalendarDetailParticipant[];
  externals: Array<{ email: string; name: string | null; responseStatus: string }>;
} | null;

/** Precedencia idéntica a buildEmailByUserMap: cuenta Google ACTIVE → email Admin. */
export function resolveInvitedVia(params: {
  hasGoogleAccount: boolean;
  adminEmail: string | null | undefined;
  adminActive: boolean;
}): InvitedVia {
  if (params.hasGoogleAccount) return "google_account";
  const email = params.adminEmail?.trim().toLowerCase();
  if (params.adminActive && email && EMAIL_RE.test(email)) return "email";
  return "none";
}

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
          select: { id: true, name: true, email: true, status: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.googleCalendarAccount.findMany({
          where: { tenantId, userId: { in: userIds }, status: "ACTIVE" },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);
  const adminById = new Map(admins.map((a) => [a.id, a]));
  const withGoogle = new Set(accounts.map((a) => a.userId));

  return {
    eventId: event.id,
    status: event.status,
    participants: event.participants.map((p) => {
      const admin = adminById.get(p.userId);
      const hasGoogle = withGoogle.has(p.userId);
      return {
        userId: p.userId,
        name: admin?.name ?? "—",
        role: p.role,
        responseStatus: p.responseStatus,
        hasGoogle,
        invitedVia: resolveInvitedVia({
          hasGoogleAccount: hasGoogle,
          adminEmail: admin?.email,
          adminActive: admin?.status === "active",
        }),
      };
    }),
    externals: event.externals.map((e) => ({
      email: e.email,
      name: e.name,
      responseStatus: e.responseStatus,
    })),
  };
}
