/**
 * Helpers de días hábiles para Chile. Solo considera sábados y domingos
 * como no hábiles. Feriados oficiales NO están incluidos en esta versión —
 * si se necesita, agregar tabla `OpsHoliday` lookup acá.
 *
 * Mes pasa como 1-12 (no 0-11).
 */

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6; // 0=Dom, 6=Sáb
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
