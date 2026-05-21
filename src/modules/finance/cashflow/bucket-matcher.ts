import "server-only";

/**
 * Bucket key compartido para matchear occurrences. Usa la granularidad
 * natural de la recurrencia: misma semana ISO para WEEKLY/BIWEEKLY,
 * mismo mes para MONTHLY, etc. Reemplaza las 5+ tolerancias en días
 * que cada matcher implementaba de forma inconsistente.
 *
 * Garantías:
 *   - Dos fechas en el mismo bucket → mismo key
 *   - El bucket es independiente del día específico (ej: día 1 y día
 *     31 del mismo mes comparten bucket MONTHLY)
 *   - Determinista: la misma fecha siempre genera el mismo key
 */
export function occurrenceBucketKey(
  date: Date,
  recurrence: string,
): string {
  const y = date.getUTCFullYear();
  switch (recurrence) {
    case "MONTHLY":
      return `${y}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    case "WEEKLY":
    case "BIWEEKLY": {
      // Semana epoch: días desde 1970-01-01 dividido por 7. Más estable
      // que "semana ISO" para el rango +-52 sem que usamos.
      const epochDays = Math.floor(date.getTime() / 86_400_000);
      const epochWeek = Math.floor(epochDays / 7);
      return `W${epochWeek}`;
    }
    case "QUARTERLY":
      return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case "YEARLY":
      return `${y}`;
    case "ONCE":
    default:
      // ONCE no aplica matching por bucket — usamos fecha exacta.
      return date.toISOString().slice(0, 10);
  }
}

/**
 * Distancia en buckets entre dos fechas para una recurrencia dada.
 * 0 = mismo bucket. Útil para sort de candidatos cuando hay varias
 * occurrences en buckets vecinos (preferir el más cercano).
 */
export function occurrenceBucketDistance(
  a: Date,
  b: Date,
  recurrence: string,
): number {
  const ka = occurrenceBucketKey(a, recurrence);
  const kb = occurrenceBucketKey(b, recurrence);
  if (ka === kb) return 0;
  switch (recurrence) {
    case "MONTHLY": {
      const months =
        (a.getUTCFullYear() - b.getUTCFullYear()) * 12 +
        (a.getUTCMonth() - b.getUTCMonth());
      return Math.abs(months);
    }
    case "WEEKLY":
    case "BIWEEKLY": {
      const da = Math.floor(a.getTime() / 86_400_000 / 7);
      const db = Math.floor(b.getTime() / 86_400_000 / 7);
      return Math.abs(da - db);
    }
    case "QUARTERLY": {
      const qa = a.getUTCFullYear() * 4 + Math.floor(a.getUTCMonth() / 3);
      const qb = b.getUTCFullYear() * 4 + Math.floor(b.getUTCMonth() / 3);
      return Math.abs(qa - qb);
    }
    case "YEARLY":
      return Math.abs(a.getUTCFullYear() - b.getUTCFullYear());
    default:
      return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
  }
}
