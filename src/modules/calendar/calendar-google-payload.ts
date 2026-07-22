/** Payload Google para CalendarEvent v2 + claves de links pendientes. */

const CHILE_TZ = "America/Santiago";

/** providerAccountId sintético para internos aún sin GoogleCalendarAccount. */
export function pendingAccountKey(userId: string): string {
  return `user:${userId}`;
}

export function userIdFromPendingKey(key: string): string | null {
  return key.startsWith("user:") ? key.slice(5) : null;
}

type EventLike = {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  externals: Array<{ email: string; optional: boolean }>;
};

export function buildCalendarEventGooglePayload(
  event: EventLike,
  internalAttendeeEmails: string[],
) {
  const attendees = [
    ...internalAttendeeEmails.map((email) => ({ email })),
    ...event.externals.map((e) => ({ email: e.email, optional: e.optional || undefined })),
  ];
  const start = event.allDay
    ? { date: event.startAt.toISOString().slice(0, 10) }
    : { dateTime: event.startAt.toISOString(), timeZone: CHILE_TZ };
  const end = event.allDay
    ? { date: event.endAt.toISOString().slice(0, 10) }
    : { dateTime: event.endAt.toISOString(), timeZone: CHILE_TZ };

  return {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start,
    end,
    attendees: attendees.length ? attendees : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup" as const, minutes: 60 },
        { method: "email" as const, minutes: 1440 },
      ],
    },
  };
}
