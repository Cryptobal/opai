/**
 * Helpers de "jornada de marcación" en zona horaria de Chile.
 *
 * El servidor corre en UTC pero los guardias están en Chile (UTC-3/UTC-4).
 * Decidir "entrada o salida" o validar duplicados con el día-calendario UTC
 * (`new Date(); setHours(0,0,0,0)`) deja huérfanos los turnos que cruzan la
 * medianoche UTC (~20:00–21:00 Chile y todos los nocturnos): la entrada cae en
 * un día UTC y la salida en otro, y el sistema vuelve a ofrecer ENTRADA.
 *
 * Este módulo centraliza la lógica reutilizando `@/lib/rondas/timezone`
 * (el mismo helper que ya arregló el módulo de rondas) para que los endpoints
 * de marcación dejen de copiar lógica de día UTC.
 */

import {
  startOfDayChile,
  endOfDayChile,
  parseChileHour,
  toChileTime,
  CHILE_TZ,
} from "@/lib/rondas/timezone";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Ventana hacia atrás para resolver la última marca real.
 * 26h cubre un turno 12x12 + colchón sin arrastrar marcas de días previos.
 */
const VENTANA_MARCACION_HORAS = 26;

/**
 * Rango [gte, lt) del día actual en Chile, expresado en UTC.
 * Reemplaza el patrón buggy `new Date(); setHours(0,0,0,0)` para columnas
 * `Timestamptz` (p. ej. `OpsMarcacion.timestamp`).
 */
export function chileDayRange(now: Date = new Date()): { gte: Date; lt: Date } {
  const gte = startOfDayChile(now);
  const end = endOfDayChile(now);
  // lt exclusivo = endOfDay + 1ms
  return { gte, lt: new Date(end.getTime() + 1) };
}

export type UltimaMarcacion = { tipo: string; timestamp: Date } | null;

/**
 * Última marcación NO eliminada del guardia dentro de la ventana hacia atrás.
 * Robusto a turnos nocturnos: no depende de límites de día calendario.
 */
export async function getUltimaMarcacion(
  db: Db,
  args: {
    guardiaId: string;
    tenantId: string;
    installationId?: string;
    now?: Date;
    ventanaHoras?: number;
  },
): Promise<UltimaMarcacion> {
  const now = args.now ?? new Date();
  const horas = args.ventanaHoras ?? VENTANA_MARCACION_HORAS;
  const desde = new Date(now.getTime() - horas * 60 * 60 * 1000);
  const ultima = await db.opsMarcacion.findFirst({
    where: {
      guardiaId: args.guardiaId,
      tenantId: args.tenantId,
      ...(args.installationId ? { installationId: args.installationId } : {}),
      timestamp: { gte: desde, lte: now },
      deletedAt: null,
    },
    orderBy: { timestamp: "desc" },
    select: { tipo: true, timestamp: true },
  });
  return ultima ?? null;
}

/**
 * Resuelve el próximo tipo de marcación para un guardia.
 *
 * Si la última marca (en la ventana) fue "entrada" sin "salida" posterior ->
 * toca SALIDA. Si fue "salida" o no hay nada reciente -> toca ENTRADA.
 */
export async function resolverProximoTipo(
  db: Db,
  args: { guardiaId: string; tenantId: string; installationId?: string; now?: Date },
): Promise<"entrada" | "salida"> {
  const ultima = await getUltimaMarcacion(db, args);
  return !ultima || ultima.tipo === "salida" ? "entrada" : "salida";
}

/**
 * Calcula minutos de atraso interpretando shiftStart ("HH:mm") como hora CHILE.
 * Devuelve null si no hay shiftStart o si no hubo atraso.
 */
export function calcularAtrasoMinutos(
  shiftStart: string | null | undefined,
  serverTimestamp: Date,
): number | null {
  if (!shiftStart) return null;
  const m = shiftStart.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const shiftStartUtc = parseChileHour(`${m[1]}:${m[2]}`, serverTimestamp);
  if (serverTimestamp <= shiftStartUtc) return null;
  return Math.floor((serverTimestamp.getTime() - shiftStartUtc.getTime()) / 60_000);
}

/**
 * Inicio del día en Chile como medianoche UTC del día-calendario chileno.
 *
 * Usa la misma convención que `parseDateOnly` (`src/lib/ops.ts`) y las columnas
 * `@db.Date` de la pauta: `new Date(Date.UTC(y, m-1, d))`. Esto evita cualquier
 * desfase al hacer upsert de `OpsAsistenciaDiaria.date` (que es `@db.Date`).
 *
 * Como Chile está detrás de UTC, la medianoche chilena cae en el mismo día
 * calendario en UTC, por lo que el componente de fecha coincide exactamente con
 * el de la pauta.
 */
export function chileDayStart(ts: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, mo, d] = fmt.format(ts).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

export { toChileTime };
