import { prisma } from "@/lib/prisma";

export type CalendarAuditAction =
  | "created"
  | "updated"
  | "rescheduled"
  | "reassigned"
  | "cancelled"
  | "completed"
  | "rsvp"
  | "synced_in";

/** Registra un CalendarAuditEvent. Best-effort: nunca rompe la mutación. */
export async function recordCalendarAudit(input: {
  tenantId: string;
  eventId: string;
  actorId?: string | null;
  action: CalendarAuditAction;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.calendarAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        eventId: input.eventId,
        actorId: input.actorId ?? null,
        action: input.action,
        payload: (input.payload ?? {}) as object,
      },
    });
  } catch (err) {
    console.warn("[calendar-v2] audit falló:", err instanceof Error ? err.message : err);
  }
}
