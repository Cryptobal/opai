/** Payload Google para CalendarEvent v2 + claves de links pendientes. */

import { formatInTimeZone } from "date-fns-tz";
import { addDaysChile, startOfDayChile, ymdInChile, CHILE_TZ } from "@/lib/dates-cl";

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

/**
 * All-day Google: end exclusivo, fechas en calendario Chile (no UTC).
 * `dateTime`/`timeZone` van en null para que events.patch limpie un evento
 * previo timed (si no, Google responde "Invalid start time.").
 */
export function chileAllDayStartEnd(startAt: Date, endAt: Date): {
  start: { date: string; dateTime: null; timeZone: null };
  end: { date: string; dateTime: null; timeZone: null };
} {
  const startYmd = ymdInChile(startAt);
  // Google all-day usa end exclusivo. Si endAt cae después de las
  // 00:01 del día Chile de fin (p.ej. 23:59), ese día es inclusive → +1.
  const endSod = startOfDayChile(endAt);
  const endExclusive =
    endAt.getTime() > endSod.getTime() + 60_000
      ? ymdInChile(addDaysChile(endAt, 1))
      : ymdInChile(endAt);
  const endYmd =
    endExclusive <= startYmd ? ymdInChile(addDaysChile(startAt, 1)) : endExclusive;
  return {
    start: { date: startYmd, dateTime: null, timeZone: null },
    end: { date: endYmd, dateTime: null, timeZone: null },
  };
}

/**
 * Timed event: offset Chile explícito + timeZone.
 * `date: null` limpia un evento previo all-day en events.patch.
 */
export function chileDateTimePayload(d: Date): {
  dateTime: string;
  timeZone: string;
  date: null;
} {
  return {
    dateTime: formatInTimeZone(d, CHILE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    timeZone: CHILE_TZ,
    date: null,
  };
}

export function buildCalendarEventGooglePayload(
  event: EventLike,
  internalAttendeeEmails: string[],
) {
  const attendees = [
    ...internalAttendeeEmails.map((email) => ({ email })),
    ...event.externals.map((e) => ({ email: e.email, optional: e.optional || undefined })),
  ];
  const startEnd = event.allDay
    ? chileAllDayStartEnd(event.startAt, event.endAt)
    : {
        start: chileDateTimePayload(event.startAt),
        end: chileDateTimePayload(event.endAt),
      };

  return {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    ...startEnd,
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
