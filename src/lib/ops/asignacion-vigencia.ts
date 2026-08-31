/**
 * Vigencia de `OpsAsignacionGuardia` por fecha.
 *
 * Convención: `endDate` es **inclusivo** = último día vigente en todos los flujos
 * (traslado, desasignar, finiquito, edición de fechas). `isActive` es solo
 * "registro cerrado/abierto" y **nunca** se usa para decidir presencia por fecha.
 *
 * Todas las comparaciones son sobre fechas UTC-midnight (`@db.Date`):
 * comparar con `getTime()`, nunca con `new Date()` sin normalizar.
 *
 * Este módulo es seguro para `"use client"`. Los fragmentos Prisma
 * (`vigenteWhere`, `solapaRangoWhere`, `notEndedWhere`) viven en
 * `asignacion-vigencia-db.ts`.
 */
import { todayInChile } from "@/lib/dates-cl";
import { parseDateOnly } from "@/lib/ops-dates";

export type RangoVigencia = {
  startDate: Date;
  endDate: Date | null;
  createdAt?: Date;
};

/** `startDate <= date AND (endDate IS NULL OR endDate >= date)`. `endDate` inclusivo. */
export function isVigenteOn(a: RangoVigencia, date: Date): boolean {
  const t = date.getTime();
  if (a.startDate.getTime() > t) return false;
  if (a.endDate === null) return true;
  return a.endDate.getTime() >= t;
}

/** `startDate <= end AND (endDate IS NULL OR endDate >= start)`. */
export function overlapsRange(a: RangoVigencia, start: Date, end: Date): boolean {
  if (a.startDate.getTime() > end.getTime()) return false;
  if (a.endDate === null) return true;
  return a.endDate.getTime() >= start.getTime();
}

/**
 * Asignación vigente en `date`. Si hay solape legado de un día, gana la de
 * `startDate` mayor; a igualdad, la más nueva (`createdAt`).
 */
export function resolveVigente<T extends RangoVigencia>(
  list: T[],
  date: Date,
): T | null {
  const vigentes = list.filter((a) => isVigenteOn(a, date));
  if (vigentes.length === 0) return null;
  vigentes.sort((a, b) => {
    const startDiff = b.startDate.getTime() - a.startDate.getTime();
    if (startDiff !== 0) return startDiff;
    const ac = a.createdAt?.getTime() ?? 0;
    const bc = b.createdAt?.getTime() ?? 0;
    return bc - ac;
  });
  return vigentes[0] ?? null;
}

/**
 * Próxima asignación con `startDate` posterior a `date` (la de inicio más cercano).
 * Independiente de `isActive`.
 */
export function nextAsignacion<T extends { startDate: Date }>(
  list: T[],
  date: Date,
): T | null {
  const futuras = list.filter((a) => a.startDate.getTime() > date.getTime());
  if (futuras.length === 0) return null;
  futuras.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return futuras[0] ?? null;
}

/**
 * No vencida en `date` (incluye vigentes y futuras). `endDate` inclusivo.
 * Coincide con `listAsignaciones({ activeOnly: true })`.
 */
export function isNotEndedOn(a: { endDate: Date | null }, date: Date): boolean {
  return a.endDate === null || a.endDate.getTime() >= date.getTime();
}

/** Hoy Chile como UTC-midnight (`@db.Date`). */
export function hoyChileDate(now: Date = new Date()): Date {
  return parseDateOnly(todayInChile(now));
}

/** Suma `n` días calendario en UTC (fechas `@db.Date`). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
