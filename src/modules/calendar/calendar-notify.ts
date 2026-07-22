/**
 * Notificación OPAI de agenda (B7): push + in-app (bell) + Slack DM vía la
 * plataforma notify() existente, con deep link /opai/agenda/evento/[id].
 * Canal garantizado interno: llega a participantes con o sin Google.
 */
import { prisma } from "@/lib/prisma";
import { CHILE_TZ } from "@/lib/dates-cl";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

export type CalendarNotifyKind = "invited" | "updated" | "cancelled" | "reminder";

const KIND_TO_TYPE: Record<CalendarNotifyKind, string> = {
  invited: "agenda_invited",
  updated: "agenda_updated",
  cancelled: "agenda_cancelled",
  reminder: "agenda_reminder",
};

function formatEventWhen(startAt: Date, endAt: Date): string {
  const fmtDay = new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: CHILE_TZ,
  });
  const fmtTime = new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CHILE_TZ,
  });
  return `${fmtDay.format(startAt)} · ${fmtTime.format(startAt)}–${fmtTime.format(endAt)}`;
}

const KIND_TITLE: Record<CalendarNotifyKind, (title: string) => string> = {
  invited: (t) => `Te invitaron: ${t}`,
  updated: (t) => `Cambio de horario: ${t}`,
  cancelled: (t) => `Cancelado: ${t}`,
  reminder: (t) => `En 1 hora: ${t}`,
};

/**
 * Notifica a los participantes internos del evento (excluye al actor: los
 * cambios propios no se auto-notifican).
 */
export async function notifyCalendarEvent(input: {
  tenantId: string;
  eventId: string;
  kind: CalendarNotifyKind;
  actorId?: string | null;
  /** Restringe los destinatarios (ej: solo los recién invitados). */
  targetUserIds?: string[];
}): Promise<{ delivered: number }> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: input.eventId, tenantId: input.tenantId },
    include: { participants: { select: { userId: true } } },
  });
  if (!event) return { delivered: 0 };

  const participantIds = new Set(event.participants.map((p) => p.userId));
  const base = input.targetUserIds
    ? input.targetUserIds.filter((id) => participantIds.has(id))
    : [...participantIds];
  const targetIds = [...new Set(base)].filter((id) => id !== input.actorId);
  if (!targetIds.length) return { delivered: 0 };

  const { notify } = await import("@/lib/notifications/notify");
  return notify({
    tenantId: input.tenantId,
    type: KIND_TO_TYPE[input.kind],
    targetIds,
    targetType: "ADMIN",
    title: KIND_TITLE[input.kind](event.title),
    body: formatEventWhen(event.startAt, event.endAt),
    link: `${getCanonicalSiteUrl()}/opai/agenda/evento/${event.id}`,
    data: { eventId: event.id, kind: event.kind },
  });
}

const REMINDER_WINDOW_MIN = 55;
const REMINDER_WINDOW_MAX = 65;

/**
 * Recordatorio 60 min antes. Corre desde el cron flush-push-outbox (cada
 * minuto); idempotente vía CalendarAuditEvent action:"reminder".
 */
export async function sendCalendarEventReminders(now = new Date()): Promise<{ notified: number }> {
  const from = new Date(now.getTime() + REMINDER_WINDOW_MIN * 60_000);
  const to = new Date(now.getTime() + REMINDER_WINDOW_MAX * 60_000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      status: "confirmed",
      allDay: false,
      startAt: { gte: from, lt: to },
    },
    select: { id: true, tenantId: true },
    take: 100,
  });
  if (!events.length) return { notified: 0 };

  const already = await prisma.calendarAuditEvent.findMany({
    where: { eventId: { in: events.map((e) => e.id) }, action: "reminder" },
    select: { eventId: true },
  });
  const done = new Set(already.map((a) => a.eventId));

  let notified = 0;
  for (const ev of events) {
    if (done.has(ev.id)) continue;
    try {
      await prisma.calendarAuditEvent.create({
        data: { tenantId: ev.tenantId, eventId: ev.id, action: "reminder", payload: {} },
      });
      await notifyCalendarEvent({ tenantId: ev.tenantId, eventId: ev.id, kind: "reminder" });
      notified += 1;
    } catch (err) {
      console.warn("[calendar-v2] reminder falló:", ev.id, err);
    }
  }
  return { notified };
}
