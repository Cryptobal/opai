import "server-only";
import type {
  FinanceFlowPlanRecurrence, FlowPlanCurrency, FlowRecurrenceFrequency,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUfValueForDate } from "@/lib/uf";
import { toYmd, weekStartYmd, ymdToDate } from "./weeks";
import { bulkFill, upsertCell, type PlanCellDto } from "./plan.service";
import { listClosedV3Weeks } from "./weekly-close.adapter";
import { ufTargetDate, ufToClp } from "./uf-occurrence";

/**
 * Egresos recurrentes de PLAN (§5J / v4 UF). La regla se persiste
 * (FinanceFlowPlanRecurrence) y se materializa en celdas FinanceFlowPlanCell
 * normales hacia adelante. Editar reescribe SOLO las celdas futuras (semanas ≥
 * la semana actual); las pasadas nunca se tocan. Semanas selladas se saltan.
 *
 * currency=UF: cada ocurrencia resuelve CLP con la política UF y se materializa
 * como entero. rematerializeUfRecurrences recalcula futuras no selladas.
 */

const EGRESO_SECTIONS = new Set(["REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS"]);

export interface RecurrenceInput {
  amount: number;
  frequency: FlowRecurrenceFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  currency?: FlowPlanCurrency;
  amountUf?: number | null;
  ufPolicy?: string | null;
  ufCustomDay?: number | null;
}

/** Horizonte de materialización: min(endDate, hoy + 12 meses). */
function horizonEndYmd(endDate: string | null | undefined): string {
  const today = new Date();
  const plus12m = toYmd(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, today.getUTCDate())),
  );
  if (endDate && endDate < plus12m) return endDate;
  return plus12m;
}

function daysInMonthUTC(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/** Fechas de ocurrencia (YMD, UTC) de la regla en [startDate, horizonEnd]. */
export function expandOccurrenceDates(
  frequency: FlowRecurrenceFrequency,
  startYmd: string,
  endYmd: string,
  dayOfMonth: number | null | undefined,
): string[] {
  const start = ymdToDate(startYmd);
  const end = ymdToDate(endYmd);
  if (!start || !end || end.getTime() < start.getTime()) return [];
  const out: string[] = [];

  if (frequency === "MONTHLY") {
    const day = dayOfMonth ?? start.getUTCDate();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let guard = 0; guard < 240; guard++) {
      const clamped = Math.min(day, daysInMonthUTC(y, m));
      const d = new Date(Date.UTC(y, m, clamped));
      if (d.getTime() > end.getTime()) break;
      if (d.getTime() >= start.getTime()) out.push(toYmd(d));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }

  const stepDays = frequency === "BIWEEKLY" ? 14 : 7;
  let t = start.getTime();
  for (let guard = 0; guard < 1200 && t <= end.getTime(); guard++) {
    out.push(toYmd(new Date(t)));
    t += stepDays * 86_400_000;
  }
  return out;
}

function occurrenceDates(rule: {
  frequency: FlowRecurrenceFrequency;
  startDate: Date;
  endDate: Date | null;
  dayOfMonth: number | null;
}): string[] {
  const startYmd = toYmd(rule.startDate);
  const endYmd = horizonEndYmd(rule.endDate ? toYmd(rule.endDate) : null);
  return expandOccurrenceDates(rule.frequency, startYmd, endYmd, rule.dayOfMonth);
}

/** Semanas ISO (lunes YMD) únicas de las ocurrencias de la regla. */
function occurrenceWeeks(rule: {
  frequency: FlowRecurrenceFrequency;
  startDate: Date;
  endDate: Date | null;
  dayOfMonth: number | null;
}): string[] {
  return Array.from(new Set(occurrenceDates(rule).map((d) => weekStartYmd(ymdToDate(d)!))));
}

/** CLP fijo: escribe `amount` en las semanas, saltando selladas. */
async function materializeClp(
  tenantId: string,
  rowId: string,
  weeks: string[],
  amount: number,
  updatedBy: string | null,
): Promise<PlanCellDto[]> {
  if (weeks.length === 0) return [];
  const sealed = new Set(await listClosedV3Weeks(tenantId, weeks));
  const writable = weeks.filter((w) => !sealed.has(w));
  if (writable.length === 0) return [];
  return bulkFill(tenantId, rowId, writable, amount, updatedBy);
}

/** UF: CLP distinto por ocurrencia; agrupa por semana (última ocurrencia gana). */
async function materializeUf(
  tenantId: string,
  rowId: string,
  rule: FinanceFlowPlanRecurrence,
  weekFilter: (w: string) => boolean,
  updatedBy: string | null,
): Promise<PlanCellDto[]> {
  const amountUf = Number(rule.amountUf ?? 0);
  if (!(amountUf > 0)) return [];
  const dates = occurrenceDates(rule);
  const weekToClp = new Map<string, number>();
  for (const ymd of dates) {
    const week = weekStartYmd(ymdToDate(ymd)!);
    if (!weekFilter(week)) continue;
    const target = ufTargetDate(rule.ufPolicy, rule.ufCustomDay, ymdToDate(ymd)!);
    const uf = await getUfValueForDate(target);
    weekToClp.set(week, ufToClp(amountUf, uf));
  }
  const weeks = [...weekToClp.keys()];
  if (weeks.length === 0) return [];
  const sealed = new Set(await listClosedV3Weeks(tenantId, weeks));
  const cells: PlanCellDto[] = [];
  for (const [week, clp] of weekToClp) {
    if (sealed.has(week)) continue;
    cells.push(await upsertCell(tenantId, rowId, week, clp, updatedBy));
  }
  return cells;
}

async function materializeRule(
  tenantId: string,
  rule: FinanceFlowPlanRecurrence,
  weeks: string[],
  updatedBy: string | null,
): Promise<PlanCellDto[]> {
  if (rule.currency === "UF") {
    const allow = new Set(weeks);
    return materializeUf(tenantId, rule.rowId, rule, (w) => allow.has(w), updatedBy);
  }
  return materializeClp(tenantId, rule.rowId, weeks, Number(rule.amount), updatedBy);
}

async function assertEgresoRow(tenantId: string, rowId: string): Promise<{ section: string }> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { section: true, archivedAt: true },
  });
  if (!row) throw new Error("Fila no encontrada");
  if (row.archivedAt) throw new Error("Fila archivada: no admite egreso recurrente");
  if (!EGRESO_SECTIONS.has(row.section)) {
    throw new Error("El egreso recurrente solo aplica a secciones de egreso");
  }
  return { section: row.section };
}

export interface RecurrenceDto {
  id: string;
  rowId: string;
  amount: number;
  currency: FlowPlanCurrency;
  amountUf: number | null;
  ufPolicy: string | null;
  ufCustomDay: number | null;
  frequency: FlowRecurrenceFrequency;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
}

export function toRecurrenceDto(r: FinanceFlowPlanRecurrence): RecurrenceDto {
  return {
    id: r.id,
    rowId: r.rowId,
    amount: Number(r.amount),
    currency: r.currency,
    amountUf: r.amountUf != null ? Number(r.amountUf) : null,
    ufPolicy: r.ufPolicy,
    ufCustomDay: r.ufCustomDay,
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
    startDate: toYmd(r.startDate),
    endDate: r.endDate ? toYmd(r.endDate) : null,
  };
}

export interface RecurrenceResult {
  rule: FinanceFlowPlanRecurrence;
  cells: PlanCellDto[];
}

async function estimateClpForStorage(input: RecurrenceInput): Promise<number> {
  if (input.currency === "UF") {
    const ufAmt = input.amountUf ?? 0;
    const uf = await getUfValueForDate(new Date());
    return ufToClp(ufAmt, uf);
  }
  return input.amount;
}

export async function createRecurrence(
  tenantId: string,
  rowId: string,
  input: RecurrenceInput,
  createdBy: string | null,
): Promise<RecurrenceResult> {
  await assertEgresoRow(tenantId, rowId);
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  const currency: FlowPlanCurrency = input.currency ?? "CLP";
  if (currency === "UF" && !(input.amountUf != null && input.amountUf > 0)) {
    throw new Error("amountUf requerido para moneda UF");
  }
  const amountClp = await estimateClpForStorage(input);
  const rule = await prisma.financeFlowPlanRecurrence.create({
    data: {
      tenantId,
      rowId,
      amount: amountClp,
      currency,
      amountUf: currency === "UF" ? input.amountUf! : null,
      ufPolicy: currency === "UF" ? (input.ufPolicy ?? "RUN_DAY") : null,
      ufCustomDay: currency === "UF" && input.ufPolicy === "CUSTOM_DAY"
        ? (input.ufCustomDay ?? 1)
        : null,
      frequency: input.frequency,
      dayOfMonth: input.frequency === "MONTHLY" ? (input.dayOfMonth ?? null) : null,
      startDate: ymdToDate(input.startDate)!,
      endDate: input.endDate ? ymdToDate(input.endDate) : null,
      createdBy,
    },
  });
  const weeks = occurrenceWeeks(rule);
  const cells = await materializeRule(tenantId, rule, weeks, createdBy);
  return { rule, cells };
}

export async function updateRecurrence(
  tenantId: string,
  ruleId: string,
  input: Partial<RecurrenceInput>,
  updatedBy: string | null,
): Promise<RecurrenceResult> {
  const old = await prisma.financeFlowPlanRecurrence.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!old) throw new Error("Regla recurrente no encontrada");

  const currency = input.currency ?? old.currency;
  const next = {
    amount: input.amount ?? Number(old.amount),
    currency,
    amountUf:
      input.amountUf !== undefined
        ? input.amountUf
        : old.amountUf != null
          ? Number(old.amountUf)
          : null,
    ufPolicy:
      input.ufPolicy !== undefined ? input.ufPolicy : old.ufPolicy,
    ufCustomDay:
      input.ufCustomDay !== undefined ? input.ufCustomDay : old.ufCustomDay,
    frequency: input.frequency ?? old.frequency,
    dayOfMonth:
      input.dayOfMonth !== undefined ? input.dayOfMonth : old.dayOfMonth,
    startDate: input.startDate ?? toYmd(old.startDate),
    endDate:
      input.endDate !== undefined
        ? input.endDate
        : old.endDate
          ? toYmd(old.endDate)
          : null,
  };
  if (next.endDate && next.endDate < next.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  if (next.currency === "UF" && !(next.amountUf != null && next.amountUf > 0)) {
    throw new Error("amountUf requerido para moneda UF");
  }

  const amountClp = await estimateClpForStorage({
    amount: next.amount,
    frequency: next.frequency,
    startDate: next.startDate,
    currency: next.currency,
    amountUf: next.amountUf,
    ufPolicy: next.ufPolicy,
    ufCustomDay: next.ufCustomDay,
  });

  const currentWeek = weekStartYmd(new Date());
  const isFuture = (w: string) => w >= currentWeek;

  const oldFuture = occurrenceWeeks(old).filter(isFuture);
  if (oldFuture.length > 0) {
    await materializeClp(tenantId, old.rowId, oldFuture, 0, updatedBy);
  }

  const rule = await prisma.financeFlowPlanRecurrence.update({
    where: { id: old.id },
    data: {
      amount: amountClp,
      currency: next.currency,
      amountUf: next.currency === "UF" ? next.amountUf : null,
      ufPolicy: next.currency === "UF" ? (next.ufPolicy ?? "RUN_DAY") : null,
      ufCustomDay:
        next.currency === "UF" && next.ufPolicy === "CUSTOM_DAY"
          ? (next.ufCustomDay ?? 1)
          : null,
      frequency: next.frequency,
      dayOfMonth: next.frequency === "MONTHLY" ? (next.dayOfMonth ?? null) : null,
      startDate: ymdToDate(next.startDate)!,
      endDate: next.endDate ? ymdToDate(next.endDate) : null,
    },
  });

  const newFuture = occurrenceWeeks(rule).filter(isFuture);
  const cells = await materializeRule(tenantId, rule, newFuture, updatedBy);
  return { rule, cells };
}

export async function deleteRecurrence(
  tenantId: string,
  ruleId: string,
  keepCells: boolean,
  updatedBy: string | null,
): Promise<{ deleted: true }> {
  const rule = await prisma.financeFlowPlanRecurrence.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!rule) throw new Error("Regla recurrente no encontrada");

  if (!keepCells) {
    const currentWeek = weekStartYmd(new Date());
    const future = occurrenceWeeks(rule).filter((w) => w >= currentWeek);
    if (future.length > 0) await materializeClp(tenantId, rule.rowId, future, 0, updatedBy);
  }
  await prisma.financeFlowPlanRecurrence.delete({ where: { id: rule.id } });
  return { deleted: true };
}

/**
 * Recalcula CLP de reglas UF en semanas futuras no selladas.
 * Idempotente; invocado desde cron cashflow-sync y al guardar.
 */
export async function rematerializeUfRecurrences(
  tenantId: string,
): Promise<{ rules: number; cells: number }> {
  const rules = await prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, currency: "UF" },
  });
  const currentWeek = weekStartYmd(new Date());
  let cells = 0;
  for (const rule of rules) {
    if (rule.endDate && toYmd(rule.endDate) < toYmd(new Date())) continue;
    const future = occurrenceWeeks(rule).filter((w) => w >= currentWeek);
    const written = await materializeRule(tenantId, rule, future, null);
    cells += written.length;
  }
  return { rules: rules.length, cells };
}

/** Reglas recurrentes de una fila (para editarlas desde el menú). */
export async function listRecurrencesForRow(
  tenantId: string,
  rowId: string,
): Promise<FinanceFlowPlanRecurrence[]> {
  return prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, rowId },
    orderBy: { createdAt: "asc" },
  });
}
