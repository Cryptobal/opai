/** Feriados oficiales de Chile (fechas fijas + móviles por Pascua / lunes). */

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

/** Si no cae lunes, se mueve al lunes siguiente (Ley 19.668). */
function mondayize(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 1) return ymd(d);
  const add = dow === 0 ? 1 : 8 - dow;
  return ymd(addDaysUtc(d, add));
}

export function chileHolidaysForYear(year: number): Set<string> {
  const set = new Set<string>();
  const add = (m: number, d: number) =>
    set.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  add(1, 1);
  add(5, 1);
  add(5, 21);
  add(6, 20);
  add(7, 16);
  add(8, 15);
  add(9, 18);
  add(9, 19);
  add(11, 1);
  add(12, 8);
  add(12, 25);

  const easter = easterSunday(year);
  set.add(ymd(addDaysUtc(easter, -2)));
  set.add(ymd(addDaysUtc(easter, -1)));

  set.add(mondayize(year, 6, 29));
  set.add(mondayize(year, 10, 12));
  set.add(mondayize(year, 10, 31));

  return set;
}

const holidayCache = new Map<number, Set<string>>();

export function isChileHoliday(ymdDate: string): boolean {
  const year = Number(ymdDate.slice(0, 4));
  let set = holidayCache.get(year);
  if (!set) {
    set = chileHolidaysForYear(year);
    holidayCache.set(year, set);
  }
  return set.has(ymdDate);
}

export function isSundayUtc(date: Date): boolean {
  return date.getUTCDay() === 0;
}

export function isSundayOrHolidayYmd(ymdDate: string): boolean {
  const [y, m, d] = ymdDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 0 || isChileHoliday(ymdDate);
}
