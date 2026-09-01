/** Evita el dump de ayer+hoy al encender el toggle. El cron de 5 min cubre el hueco. */
export const FALTA_ALERT_SEND_WINDOW_MS = 2 * 60 * 60 * 1000;

export function isFaltaAlertDue(now: Date, dueAt: Date): boolean {
  const elapsed = now.getTime() - dueAt.getTime();
  return elapsed >= 0 && elapsed <= FALTA_ALERT_SEND_WINDOW_MS;
}
