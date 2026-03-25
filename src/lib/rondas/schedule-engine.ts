import { getChileDayOfWeek, parseChileHour } from "./timezone";

export interface NextSlotsInput {
  from: Date; // UTC
  to: Date; // UTC
  diasSemana: number[]; // 0=Sun .. 6=Sat (Chile local days)
  horaInicio: string; // "HH:mm" in Chile time
  horaFin: string; // "HH:mm" in Chile time
  frecuenciaMinutos: number;
  horariosCustom?: string[] | null; // ["22:00","00:00","01:30"] Chile time — overrides frecuenciaMinutos
}

/**
 * Generate UTC schedule slots for the given range.
 * Hours are interpreted as Chile local time (America/Santiago) and converted to UTC.
 * Days of week are checked in Chile local time.
 * Handles DST transitions correctly via date-fns-tz.
 *
 * When horariosCustom is provided, slots are generated at those exact times
 * instead of at fixed frecuenciaMinutos intervals.
 */
export function buildScheduleSlots(input: NextSlotsInput): Date[] {
  const useCustom = Array.isArray(input.horariosCustom) && input.horariosCustom.length > 0;

  if (!useCustom && input.frecuenciaMinutos <= 0) return [];

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

    if (useCustom) {
      // Custom mode: generate slots at each specified time
      for (const hhmm of input.horariosCustom!) {
        let slotTime = parseChileHour(hhmm, dayDate);

        // If the custom time falls before window start (overnight),
        // push it to the next day (e.g., "01:30" when window starts at "21:00")
        if (slotTime < windowStart) {
          slotTime = new Date(slotTime.getTime() + 24 * 60 * 60 * 1000);
        }

        if (slotTime >= windowStart && slotTime < windowEnd &&
            slotTime >= input.from && slotTime <= input.to) {
          slots.push(slotTime);
        }
      }
    } else {
      // Frequency mode: generate slots at fixed intervals (existing logic)
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
  }

  // Sort chronologically (custom times may not be in order)
  slots.sort((a, b) => a.getTime() - b.getTime());

  return slots;
}

/**
 * Preview helper: given a time window and either frequency or custom times,
 * returns an array of "HH:mm" strings showing the schedule for one day.
 * Used in the UI to show what slots will be generated.
 */
export function previewSlotTimes(
  horaInicio: string,
  horaFin: string,
  frecuenciaMinutos: number,
  horariosCustom?: string[] | null,
): string[] {
  const useCustom = Array.isArray(horariosCustom) && horariosCustom.length > 0;

  if (useCustom) {
    // For custom, just return the sorted custom times
    return [...horariosCustom!].sort((a, b) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      // Normalize: times before horaInicio are "next day" (overnight)
      const [sh] = horaInicio.split(":").map(Number);
      const aNorm = ah < sh ? ah + 24 : ah;
      const bNorm = bh < sh ? bh + 24 : bh;
      return aNorm * 60 + am - (bNorm * 60 + bm);
    });
  }

  // Frequency mode: calculate slots
  const [sh, sm] = horaInicio.split(":").map(Number);
  const [eh, em] = horaFin.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // overnight

  const times: string[] = [];
  for (let m = startMin; m < endMin; m += frecuenciaMinutos) {
    const normalizedM = m % (24 * 60);
    const hh = String(Math.floor(normalizedM / 60)).padStart(2, "0");
    const mm = String(normalizedM % 60).padStart(2, "0");
    times.push(`${hh}:${mm}`);
  }
  return times;
}
