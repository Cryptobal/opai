import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeWeeklyCloseSnapshot,
  persistWeeklyClose,
  reopenWeeklyClose,
} from "@/modules/finance/cashflow/weekly-close.service";
import { startOfIsoWeekUTC, toYmd, weekLabel, ymdToDate } from "./weeks";

/**
 * Puente entre el cierre semanal v3 y el servicio v2 (weekly-close.service.ts),
 * que se REUTILIZA sin modificar su lógica.
 *
 * §4 hipótesis comprobadas:
 *  1. Límites de semana. v3 planifica en semanas ISO (lunes→domingo, UTC). v2
 *     cierra en semanas terminadas en `weekClosingDow` (viernes por defecto ⇒
 *     sábado→viernes). NO se reinterpreta el modelo v2: se NORMALIZA aquí. Cada
 *     semana ISO se representa por su día de cierre v2 (lunes + offset del dow),
 *     calculado en UTC para evitar el bug de zona horaria de date-fns
 *     (getDay() local) documentado en recurrence-engine. La diferencia de
 *     borde (±1–2 días) se reporta: el diálogo muestra la etiqueta ISO y este
 *     adaptador cierra la semana v2 que la contiene.
 *  2. Occurrence de ajuste. El cierre manual crea una FinanceCashflowOccurrence
 *     (isClosingAdjust) en v2. Se verificó que la matriz v3 NO lee occurrences
 *     (load-committed-income/expense y load-real leen DTE, programaciones y
 *     banco, nunca FinanceCashflowOccurrence), así que ese ajuste NO produce filas fantasma
 *     en v3. Por eso el cierre manual SÍ se expone en esta fase.
 */

async function closingDow(tenantId: string): Promise<number> {
  const cfg = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { weekClosingDow: true },
  });
  return cfg?.weekClosingDow ?? 5;
}

/** Día de cierre v2 (mediodía UTC) de la semana ISO cuyo lunes es `mondayYmd`.
 *  offset = (dow - 1) mod 7 días desde el lunes ISO (getUTCDay(lunes)=1). El
 *  mediodía UTC mantiene el día calendario en servidores UTC y en Chile (−3/−4). */
function v2WeekEndDate(mondayYmd: string, dow: number): Date {
  const monday = ymdToDate(mondayYmd)!;
  const offset = ((dow - 1) % 7 + 7) % 7;
  const day = new Date(monday.getTime() + offset * 86_400_000);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12));
}

/** YMD del día de cierre v2 de la semana ISO (para comparar contra closes). */
function v2WeekEndYmd(mondayYmd: string, dow: number): string {
  return toYmd(v2WeekEndDate(mondayYmd, dow));
}

export interface V3WeeklyCloseSnapshot {
  /** Lunes ISO de la semana v3 que se cierra. */
  weekStartYmd: string;
  /** Domingo ISO (fin de la semana v3). */
  weekEndYmd: string;
  weekLabel: string;
  /** Saldo banco sugerido (del snapshot v2). */
  bankBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  unassignedBankCount: number;
  unfulfilledProjCount: number;
  alreadyClosed: boolean;
  isFuture: boolean;
  /** Normalización reportable: día de cierre v2 subyacente (YMD). */
  v2WeekEndYmd: string;
}

/** Resuelve la semana v3 a partir de cualquier día que caiga en ella. */
function resolveWeek(anyDayYmd: string): { monday: string; sunday: string } {
  const d = ymdToDate(anyDayYmd);
  if (!d) throw new Error("Fecha inválida");
  const mondayDate = startOfIsoWeekUTC(d);
  const monday = toYmd(mondayDate);
  const sunday = toYmd(new Date(mondayDate.getTime() + 6 * 86_400_000));
  return { monday, sunday };
}

async function isWeekClosed(tenantId: string, mondayYmd: string, dow: number): Promise<boolean> {
  const targetYmd = v2WeekEndYmd(mondayYmd, dow);
  const target = ymdToDate(targetYmd)!;
  const close = await prisma.financeCashflowWeeklyClose.findFirst({
    where: {
      tenantId,
      // el weekEndDate v2 se guarda como @db.Date (medianoche UTC del día de cierre)
      weekEndDate: { gte: target, lt: new Date(target.getTime() + 86_400_000) },
    },
    select: { id: true },
  });
  return !!close;
}

/** Snapshot de cierre para la semana v3 que contiene `anyDayYmd`. */
export async function getV3WeeklyCloseSnapshot(
  tenantId: string,
  anyDayYmd: string,
): Promise<V3WeeklyCloseSnapshot> {
  const { monday, sunday } = resolveWeek(anyDayYmd);
  const dow = await closingDow(tenantId);
  const weekEnd = v2WeekEndDate(monday, dow);
  const snap = await computeWeeklyCloseSnapshot(tenantId, weekEnd);
  const alreadyClosed = await isWeekClosed(tenantId, monday, dow);
  const currentMonday = toYmd(startOfIsoWeekUTC(new Date()));
  return {
    weekStartYmd: monday,
    weekEndYmd: sunday,
    weekLabel: weekLabel(monday),
    bankBalanceClp: Math.round(snap.bankBalanceClp),
    projectedBalanceClp: Math.round(snap.projectedBalanceClp),
    varianceClp: Math.round(snap.varianceClp),
    unassignedBankCount: snap.unassignedBank.length,
    unfulfilledProjCount: snap.unfulfilledProj.length,
    alreadyClosed,
    isFuture: monday > currentMonday,
    v2WeekEndYmd: v2WeekEndYmd(monday, dow),
  };
}

export interface PersistV3CloseInput {
  anyDayYmd: string;
  /** Saldo de cierre confirmado por el usuario (sugerido = banco). */
  closedBalance: number;
  notes?: string;
  /** Obligatorio si closedBalance difiere del saldo banco sugerido. */
  manualReason?: string;
}

/**
 * Persiste el cierre de la semana v3. Si el saldo confirmado difiere del banco
 * sugerido → cierre MANUAL (manualReason obligatorio, genera la occurrence de
 * ajuste v2 — invisible en v3). No es anchor: el saldo de la matriz v3 se ancla
 * en el banco de hoy (resolveOpeningBalance), independiente de la proyección v2,
 * así que el cierre solo SELLA la semana sin mover el anchor de v2.
 */
export async function persistV3WeeklyClose(
  tenantId: string,
  userId: string | null,
  input: PersistV3CloseInput,
): Promise<{ weekStartYmd: string; weekEndYmd: string; isManual: boolean }> {
  const { monday, sunday } = resolveWeek(input.anyDayYmd);
  const dow = await closingDow(tenantId);
  const currentMonday = toYmd(startOfIsoWeekUTC(new Date()));
  if (monday > currentMonday) throw new Error("No se puede cerrar una semana futura");
  if (await isWeekClosed(tenantId, monday, dow)) {
    throw new Error("La semana ya está cerrada");
  }

  const weekEnd = v2WeekEndDate(monday, dow);
  const snap = await computeWeeklyCloseSnapshot(tenantId, weekEnd);
  const isManual = Math.abs(input.closedBalance - Number(snap.bankBalanceClp)) > 1;
  if (isManual && (!input.manualReason || input.manualReason.trim().length < 5)) {
    throw new Error("manualReason requerido (mínimo 5 caracteres) para un saldo distinto del banco");
  }

  await persistWeeklyClose(tenantId, userId, {
    weekEnd,
    notes: input.notes,
    anchor: false,
    mode: isManual ? "manual" : "real",
    ...(isManual
      ? { forcedBalanceClp: input.closedBalance, manualReason: input.manualReason }
      : {}),
  });

  return { weekStartYmd: monday, weekEndYmd: sunday, isManual };
}

/** Reabre el cierre de la semana v3 que contiene `anyDayYmd`. */
export async function reopenV3WeeklyClose(
  tenantId: string,
  anyDayYmd: string,
): Promise<{ weekStartYmd: string }> {
  const { monday } = resolveWeek(anyDayYmd);
  const dow = await closingDow(tenantId);
  await reopenWeeklyClose(tenantId, v2WeekEndDate(monday, dow));
  return { weekStartYmd: monday };
}

/** De una lista de lunes ISO, cuáles están selladas (para marcar el header). */
export async function listClosedV3Weeks(
  tenantId: string,
  mondayYmds: string[],
): Promise<string[]> {
  if (mondayYmds.length === 0) return [];
  const dow = await closingDow(tenantId);
  const mapped = mondayYmds.map((m) => ({ monday: m, endYmd: v2WeekEndYmd(m, dow) }));
  const ends = mapped.map((x) => ymdToDate(x.endYmd)!);
  const min = new Date(Math.min(...ends.map((d) => d.getTime())));
  const max = new Date(Math.max(...ends.map((d) => d.getTime())));
  const closes = await prisma.financeCashflowWeeklyClose.findMany({
    where: { tenantId, weekEndDate: { gte: min, lte: new Date(max.getTime() + 86_400_000) } },
    select: { weekEndDate: true },
  });
  const closedEndYmds = new Set(closes.map((c) => c.weekEndDate.toISOString().slice(0, 10)));
  return mapped.filter((x) => closedEndYmds.has(x.endYmd)).map((x) => x.monday);
}

/** Rechaza (en servidor) escrituras de plan sobre semanas selladas. */
export async function assertV3WeeksWritable(
  tenantId: string,
  mondayYmds: string[],
): Promise<void> {
  const sealed = await listClosedV3Weeks(tenantId, mondayYmds);
  if (sealed.length > 0) {
    throw new Error("Semana cerrada: reábrela para editar su plan");
  }
}
