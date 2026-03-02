import { getChileDayOfWeek, parseChileHour } from "./timezone";

export interface NextSlotsInput {
  from: Date; // UTC
  to: Date; // UTC
  diasSemana: number[]; // 0=Sun .. 6=Sat (Chile local days)
  horaInicio: string; // "HH:mm" in Chile time
  horaFin: string; // "HH:mm" in Chile time
  frecuenciaMinutos: number;
}

/**
 * Generate UTC schedule slots for the given range.
 * Hours are interpreted as Chile local time (America/Santiago) and converted to UTC.
 * Days of week are checked in Chile local time.
 * Handles DST transitions correctly via date-fns-tz.
 */
export function buildScheduleSlots(input: NextSlotsInput): Date[] {
  if (input.frecuenciaMinutos <= 0) return [];

  const slots: Date[] = [];
  const maxDays =
    Math.ceil(
      (input.to.getTime() - input.from.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;

  for (let d = 0; d < maxDays && d < 366; d++) {
    const dayDate = new Date(
      input.from.getTime() + d * 24 * 60 * 60 * 1000
    );
    const dayOfWeek = getChileDayOfWeek(dayDate);

    if (!input.diasSemana.includes(dayOfWeek)) continue;

    // Parse start/end hours as Chile local time for this day, returned as UTC
    const windowStart = parseChileHour(input.horaInicio, dayDate);
    let windowEnd = parseChileHour(input.horaFin, dayDate);

    // Handle overnight shifts (e.g., 22:00 to 06:00)
    if (windowEnd <= windowStart) {
      windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // Generate slots within the window (exclusive of end to allow completion time)
    for (
      let ts = windowStart.getTime();
      ts < windowEnd.getTime();
      ts += input.frecuenciaMinutos * 60 * 1000
    ) {
      const slotTime = new Date(ts);
      if (slotTime >= input.from && slotTime <= input.to) {
        slots.push(slotTime);
      }
    }
  }

  return slots;
}
