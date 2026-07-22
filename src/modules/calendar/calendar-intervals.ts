/** Merge de intervalos busy + sugerencia de slots libres comunes (B6). */
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { addDaysChile, ymdInChile } from "@/lib/dates-cl";

export type BusyInterval = { start: Date; end: Date; title?: string };

/** Ordena y fusiona intervalos solapados/contiguos. Conserva el primer título. */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals]
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: BusyInterval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Solapes de [start,end) contra los busy de un usuario. */
export function findConflicts(
  busy: BusyInterval[],
  start: Date,
  end: Date,
): BusyInterval[] {
  return busy.filter(
    (b) => b.start.getTime() < end.getTime() && b.end.getTime() > start.getTime(),
  );
}

const SUGGEST_START_HOUR = 8;
const SUGGEST_END_HOUR = 19;
const SUGGEST_STEP_MIN = 30;

/**
 * Hasta `count` slots (hora Chile 08–19) donde TODOS los usuarios están libres.
 * Recorre desde `from` en pasos de 30 min, máx 14 días.
 */
export function suggestCommonFreeSlots(
  allBusy: BusyInterval[][],
  from: Date,
  durationMin: number,
  count = 4,
): Array<{ start: Date; end: Date }> {
  const merged = mergeBusyIntervals(allBusy.flat());
  const out: Array<{ start: Date; end: Date }> = [];
  const durMs = durationMin * 60_000;

  let dayYmd = ymdInChile(from);
  for (let day = 0; day < 14 && out.length < count; day++) {
    for (
      let minute = SUGGEST_START_HOUR * 60;
      minute + durationMin <= SUGGEST_END_HOUR * 60 && out.length < count;
      minute += SUGGEST_STEP_MIN
    ) {
      const start = dateAtChileSlot(dayYmd, minute);
      if (start.getTime() < from.getTime()) continue;
      const end = new Date(start.getTime() + durMs);
      if (findConflicts(merged, start, end).length === 0) {
        out.push({ start, end });
        // Evitar sugerencias contiguas del mismo bloque libre.
        minute += durationMin - SUGGEST_STEP_MIN;
      }
    }
    dayYmd = ymdInChile(addDaysChile(dateAtChileSlot(dayYmd, 12 * 60), 1));
  }
  return out;
}
