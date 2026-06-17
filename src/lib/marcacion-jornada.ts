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

/**
 * Busca una marcación previa con la misma idempotencyKey (no eliminada) para
 * deduplicar reintentos del mismo intento de marca.
 */
export async function buscarMarcacionPorIdempotencyKey(
  db: Db,
  tenantId: string,
  idempotencyKey: string,
): Promise<{ id: string; tipo: string; timestamp: Date } | null> {
  return db.opsMarcacion.findFirst({
    where: { tenantId, idempotencyKey, deletedAt: null },
    select: { id: true, tipo: true, timestamp: true },
  });
}

/** True si el error es una violación de constraint único de Postgres (Prisma P2002). */
export function esViolacionUnica(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

type Dedup = { id: string; tipo: string; timestamp: Date };

/**
 * Ejecuta `fn` (típicamente el `$transaction` que crea la marca) y, si la carrera
 * dispara el índice único parcial (P2002), recupera la marca ganadora en vez de
 * fallar. Permite envolver la transacción sin re-indentar su cuerpo.
 */
export async function ejecutarConDedup<T>(
  fn: () => Promise<T>,
  ctx: { db: Db; tenantId: string; idempotencyKey?: string | null },
): Promise<{ ok: true; value: T } | { ok: false; dup: Dedup }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (ctx.idempotencyKey && esViolacionUnica(err)) {
      const dup = await buscarMarcacionPorIdempotencyKey(ctx.db, ctx.tenantId, ctx.idempotencyKey);
      if (dup) return { ok: false, dup };
    }
    throw err;
  }
}

/**
 * Resuelve la trazabilidad de una marca a partir del timestamp del dispositivo.
 * NO cambia el `timestamp` (sello del servidor, Res. N°38); sólo informa si la
 * marca llegó tarde (intento real > 90s antes del sello del servidor).
 */
export function resolverTrazabilidadMarca(args: {
  serverTimestamp: Date;
  deviceTimestamp?: string | null;
  origenMarca?: string | null;
}): { deviceTs: Date | null; esTardia: boolean; offlineSync: boolean; origenMarca: string } {
  const deviceTs = args.deviceTimestamp ? new Date(args.deviceTimestamp) : null;
  const esTardia = deviceTs
    ? args.serverTimestamp.getTime() - deviceTs.getTime() > 90_000
    : false;
  return {
    deviceTs,
    esTardia,
    offlineSync: esTardia || args.origenMarca === "offline_queue",
    origenMarca: args.origenMarca ?? (esTardia ? "sync_diferida" : "online"),
  };
}

export { toChileTime };
