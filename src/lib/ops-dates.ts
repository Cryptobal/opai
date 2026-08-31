/**
 * Fechas UTC-midnight para columnas `@db.Date`.
 * Sin `next/server` ni Prisma: lo pueden importar clients y el helper de vigencia.
 */
export function parseDateOnly(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Formato de fecha inválido. Usa YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
