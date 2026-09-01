/**
 * Helpers de días hábiles para Chile. Fin de semana = sábado/domingo.
 * Feriados opcionales como Set de YYYY-MM-DD (p. ej. PayrollHoliday del tenant).
 *
 * Mes pasa como 1-12 (no 0-11) en first/lastBusinessDayOfMonth.
 */

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6; // 0=Dom, 6=Sáb
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isBusinessDay(d: Date, holidays?: ReadonlySet<string>): boolean {
  if (isWeekend(d)) return false;
  if (holidays && holidays.has(ymdLocal(d))) return false;
  return true;
}

/** Primer día hábil estrictamente posterior a `d`. */
export function nextBusinessDay(d: Date, holidays?: ReadonlySet<string>): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  while (!isBusinessDay(next, holidays)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function firstBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return d;
}

export function lastBusinessDayOfMonth(year: number, month: number): Date {
  // Último día del mes = día 0 del mes siguiente
  const d = new Date(year, month, 0);
  while (isWeekend(d)) d.setDate(d.getDate() - 1);
  return d;
}

export function firstMondayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}
