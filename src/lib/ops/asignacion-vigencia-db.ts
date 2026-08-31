/**
 * Fragmentos Prisma de vigencia. Solo servidor — no importar desde `"use client"`.
 */
import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Fragmento Prisma de vigencia en `date` (inclusiva).
 * Spread-earlo en el `where`; no combinar con otro `OR` al mismo nivel.
 */
export function vigenteWhere(date: Date): Prisma.OpsAsignacionGuardiaWhereInput {
  return {
    startDate: { lte: date },
    OR: [{ endDate: null }, { endDate: { gte: date } }],
  };
}

/**
 * Fragmento Prisma de solape con el rango `[start, end]` (ambos inclusivos).
 * Spread-earlo en el `where`; no combinar con otro `OR` al mismo nivel.
 */
export function solapaRangoWhere(
  start: Date,
  end: Date,
): Prisma.OpsAsignacionGuardiaWhereInput {
  return {
    startDate: { lte: end },
    OR: [{ endDate: null }, { endDate: { gte: start } }],
  };
}

/**
 * Fragmento Prisma: no vencida en `date` (incluye futuras).
 * Spread-earlo en el `where`; no combinar con otro `OR` al mismo nivel.
 */
export function notEndedWhere(date: Date): Prisma.OpsAsignacionGuardiaWhereInput {
  return {
    OR: [{ endDate: null }, { endDate: { gte: date } }],
  };
}
