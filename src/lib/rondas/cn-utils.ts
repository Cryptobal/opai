import { toChileTime } from "@/lib/rondas/timezone";

/**
 * Calcula la fecha del Control Nocturno para un timestamp dado.
 * Si la hora Chile es antes de las 8AM, el CN pertenece al día anterior
 * (porque el turno nocturno empezó la noche antes).
 */
export function getCNDate(date: Date): Date {
  const chile = toChileTime(date);
  if (chile.getHours() < 8) {
    chile.setDate(chile.getDate() - 1);
  }
  chile.setHours(0, 0, 0, 0);
  return chile;
}
