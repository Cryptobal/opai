import { prisma } from "@/lib/prisma";
import { recordCalendarAudit } from "./calendar-audit";
import { addEventParticipants, type ParticipantRole } from "./calendar-participants";

export type CreateCalendarEventInput = {
  tenantId: string;
  createdBy: string;
  /** Forzar id (doble escritura legacy: CalendarEvent.id = AgendaVisita.id). */
  id?: string;
  kind?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
  participants?: Array<{ userId: string; role?: ParticipantRole }>;
  externalAttendees?: Array<{ email: string; name?: string | null; crmContactId?: string | null }>;
  reminders?: Array<{ method: string; minutesBefore: number }>;
};

/** Crea un CalendarEvent con participantes, externos y auditoría. */
export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const event = await prisma.calendarEvent.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId: input.tenantId,
      kind: input.kind ?? "event",
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      accountId: input.accountId ?? null,
      installationId: input.installationId ?? null,
      dealId: input.dealId ?? null,
      createdBy: input.createdBy,
    },
  });

  const participants = dedupeParticipants(input.createdBy, input.participants ?? []);
  await addEventParticipants(input.tenantId, event.id, participants, input.createdBy);

  for (const ext of input.externalAttendees ?? []) {
    await prisma.calendarExternalAttendee.upsert({
      where: { eventId_email: { eventId: event.id, email: ext.email } },
      create: {
        tenantId: input.tenantId,
        eventId: event.id,
        email: ext.email,
        name: ext.name ?? null,
        crmContactId: ext.crmContactId ?? null,
      },
      update: { name: ext.name ?? null, crmContactId: ext.crmContactId ?? null },
    });
  }
  for (const rem of input.reminders ?? []) {
    await prisma.calendarEventReminder.create({
      data: {
        tenantId: input.tenantId,
        eventId: event.id,
        method: rem.method,
        minutesBefore: rem.minutesBefore,
      },
    });
  }

  await recordCalendarAudit({
    tenantId: input.tenantId,
    eventId: event.id,
    actorId: input.createdBy,
    action: "created",
    payload: { kind: event.kind, title: event.title },
  });
  return event;
}

/** El creador siempre queda como organizer; si nadie es owner, el creador lo es. */
function dedupeParticipants(
  createdBy: string,
  raw: Array<{ userId: string; role?: ParticipantRole }>,
) {
  const map = new Map<string, { userId: string; role: ParticipantRole }>();
  for (const p of raw) map.set(p.userId, { userId: p.userId, role: p.role ?? "required" });
  const hasOwner = [...map.values()].some((p) => p.role === "owner");
  if (!map.has(createdBy)) {
    map.set(createdBy, { userId: createdBy, role: hasOwner ? "organizer" : "owner" });
  }
  return [...map.values()];
}

export async function updateCalendarEvent(
  tenantId: string,
  eventId: string,
  patch: Partial<
    Pick<
      CreateCalendarEventInput,
      "title" | "description" | "location" | "lat" | "lng" | "startAt" | "endAt" | "allDay"
    >
  > & { status?: string },
  actorId?: string | null,
) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
  });
  if (!existing) return null;

  const rescheduled =
    (patch.startAt && patch.startAt.getTime() !== existing.startAt.getTime()) ||
    (patch.endAt && patch.endAt.getTime() !== existing.endAt.getTime());

  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: { ...patch, version: { increment: 1 } },
  });
  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId,
    action: rescheduled ? "rescheduled" : "updated",
    payload: {
      ...(rescheduled
        ? { startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() }
        : { fields: Object.keys(patch) }),
    },
  });
  return event;
}

export async function cancelCalendarEvent(tenantId: string, eventId: string, actorId?: string | null) {
  const res = await prisma.calendarEvent.updateMany({
    where: { id: eventId, tenantId, deletedAt: null },
    data: { status: "cancelled", version: { increment: 1 } },
  });
  if (res.count === 0) return false;
  await recordCalendarAudit({ tenantId, eventId, actorId, action: "cancelled" });
  return true;
}

export async function completeCalendarEvent(tenantId: string, eventId: string, actorId?: string | null) {
  const res = await prisma.calendarEvent.updateMany({
    where: { id: eventId, tenantId, deletedAt: null },
    data: { status: "completed", version: { increment: 1 } },
  });
  if (res.count === 0) return false;
  await recordCalendarAudit({ tenantId, eventId, actorId, action: "completed" });
  return true;
}
