import "server-only";
import type {
  FinanceFlowPlanRecurrence,
  FlowPlanCurrency,
  FlowRecurrenceAmountMode,
  FlowRecurrenceFrequency,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLatestPublishedUf, getUfValueForDate } from "@/lib/uf";
import { toYmd, weekStartYmd, ymdToDate } from "./weeks";
import { bulkFill, upsertCell, type PlanCellDto } from "./plan.service";
import { listClosedV3Weeks } from "./weekly-close.adapter";
import { projectUfWithGrowth, ufTargetDate, ufToClp } from "./uf-occurrence";
import { normalizeNameForDedupe } from "./row-visibility";

/**
 * Egresos recurrentes de PLAN (§5J / v4 UF). La regla se persiste
 * (FinanceFlowPlanRecurrence) y se materializa en celdas FinanceFlowPlanCell
 * normales hacia adelante. Editar reescribe SOLO las celdas futuras (semanas ≥
 * la semana actual); las pasadas nunca se tocan. Semanas selladas se saltan.
 *
 * currency=UF: cada ocurrencia resuelve CLP con la política UF y se materializa
 * como entero. rematerializeUfRecurrences recalcula futuras no selladas.
 */

/** Secciones que admiten egreso recurrente de plan (v5: + FINANCIAMIENTO). */
const PLAN_RECURRENCE_SECTIONS = new Set([
  "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO",
]);

export interface RecurrenceInput {
  amount: number;
  frequency: FlowRecurrenceFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  /** Término tras N repeticiones; gana el que ocurra primero vs endDate. */
  endAfterOccurrences?: number | null;
  currency?: FlowPlanCurrency;
  /** FIXED (default) o PCT_SALES (% ventas netas mes anterior, derive-on-read). */
  amountMode?: FlowRecurrenceAmountMode;
  /** Porcentaje 0–100 desde API; se persiste como fracción 0–1. */
  pctSales?: number | null;
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
  endAfterOccurrences?: number | null,
): string[] {
  const start = ymdToDate(startYmd);
  const end = ymdToDate(endYmd);
  if (!start || !end || end.getTime() < start.getTime()) return [];
  const maxN =
    endAfterOccurrences != null && Number.isFinite(endAfterOccurrences) && endAfterOccurrences > 0
      ? Math.floor(endAfterOccurrences)
      : null;
  const out: string[] = [];

  if (frequency === "MONTHLY") {
    const day = dayOfMonth ?? start.getUTCDate();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let guard = 0; guard < 240; guard++) {
      if (maxN != null && out.length >= maxN) break;
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
    if (maxN != null && out.length >= maxN) break;
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
  endAfterOccurrences?: number | null;
}): string[] {
  const startYmd = toYmd(rule.startDate);
  const endYmd = horizonEndYmd(rule.endDate ? toYmd(rule.endDate) : null);
  return expandOccurrenceDates(
    rule.frequency,
    startYmd,
    endYmd,
    rule.dayOfMonth,
    rule.endAfterOccurrences,
  );
}

/** Semanas ISO (lunes YMD) únicas de las ocurrencias de la regla. */
function occurrenceWeeks(rule: {
  frequency: FlowRecurrenceFrequency;
  startDate: Date;
  endDate: Date | null;
  dayOfMonth: number | null;
  endAfterOccurrences?: number | null;
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

/** UF: CLP distinto por ocurrencia; agrupa por semana (última ocurrencia gana).
 *  Fechas posteriores a la última UF publicada usan growth compuesto
 *  (`ufMonthlyGrowthPct` del tenant). Al publicarse la UF real, rematerialize
 *  corrige (selladas intactas). */
async function materializeUf(
  tenantId: string,
  rowId: string,
  rule: FinanceFlowPlanRecurrence,
  weekFilter: (w: string) => boolean,
  updatedBy: string | null,
): Promise<PlanCellDto[]> {
  const amountUf = Number(rule.amountUf ?? 0);
  if (!(amountUf > 0)) return [];
  const [cfg, latest] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { ufMonthlyGrowthPct: true },
    }),
    getLatestPublishedUf(),
  ]);
  const growthPct = Number(cfg?.ufMonthlyGrowthPct ?? 0);
  const dates = occurrenceDates(rule);
  const weekToClp = new Map<string, number>();
  for (const ymd of dates) {
    const week = weekStartYmd(ymdToDate(ymd)!);
    if (!weekFilter(week)) continue;
    const target = ufTargetDate(rule.ufPolicy, rule.ufCustomDay, ymdToDate(ymd)!);
    const targetYmd = toYmd(target);
    let uf: number;
    if (latest && targetYmd > latest.ymd && growthPct > 0) {
      uf = projectUfWithGrowth(latest.value, latest.ymd, targetYmd, growthPct);
    } else {
      uf = await getUfValueForDate(target);
    }
    // Monto CLP de la regla puede ser negativo (FINANCIAMIENTO egreso).
    const sign = Number(rule.amount) < 0 ? -1 : 1;
    weekToClp.set(week, sign * ufToClp(amountUf, uf));
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
  // PCT_SALES: derive-on-read como comprometido; no materializa celdas de plan.
  if (rule.amountMode === "PCT_SALES") return [];
  if (rule.currency === "UF") {
    const allow = new Set(weeks);
    return materializeUf(tenantId, rule.rowId, rule, (w) => allow.has(w), updatedBy);
  }
  return materializeClp(tenantId, rule.rowId, weeks, Number(rule.amount), updatedBy);
}

/** Una sola regla PCT_SALES activa por fila: borra la anterior (reemplazo). */
async function replaceExistingPctSalesRule(
  tenantId: string,
  rowId: string,
  exceptId?: string,
): Promise<void> {
  await prisma.financeFlowPlanRecurrence.deleteMany({
    where: {
      tenantId,
      rowId,
      amountMode: "PCT_SALES",
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

function pctSalesFractionFromInput(pctSalesPercent: number | null | undefined): number | null {
  if (pctSalesPercent == null || !Number.isFinite(pctSalesPercent)) return null;
  if (pctSalesPercent <= 0 || pctSalesPercent > 100) return null;
  return Math.round(pctSalesPercent * 10_000) / 1_000_000; // 2–4 decimales de fracción
}

async function assertPlanRecurrenceRow(tenantId: string, rowId: string): Promise<{ section: string }> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { section: true, archivedAt: true },
  });
  if (!row) throw new Error("Fila no encontrada");
  if (row.archivedAt) throw new Error("Fila archivada: no admite egreso recurrente");
  if (!PLAN_RECURRENCE_SECTIONS.has(row.section)) {
    throw new Error("El egreso recurrente solo aplica a secciones de egreso o Financiamiento");
  }
  return { section: row.section };
}

export interface RecurrenceDto {
  id: string;
  rowId: string;
  amount: number;
  currency: FlowPlanCurrency;
  amountMode: FlowRecurrenceAmountMode;
  /** Porcentaje 0–100 para la UI (BD guarda fracción). */
  pctSales: number | null;
  amountUf: number | null;
  ufPolicy: string | null;
  ufCustomDay: number | null;
  frequency: FlowRecurrenceFrequency;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  endAfterOccurrences: number | null;
}

export function toRecurrenceDto(r: FinanceFlowPlanRecurrence): RecurrenceDto {
  const frac = r.pctSales != null ? Number(r.pctSales) : null;
  return {
    id: r.id,
    rowId: r.rowId,
    amount: Number(r.amount),
    currency: r.currency,
    amountMode: r.amountMode ?? "FIXED",
    pctSales: frac != null && Number.isFinite(frac) ? Math.round(frac * 10_000) / 100 : null,
    amountUf: r.amountUf != null ? Number(r.amountUf) : null,
    ufPolicy: r.ufPolicy,
    ufCustomDay: r.ufCustomDay,
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
    startDate: toYmd(r.startDate),
    endDate: r.endDate ? toYmd(r.endDate) : null,
    endAfterOccurrences: r.endAfterOccurrences ?? null,
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

export interface NewRecurrenceRowInput {
  section: string;
  name: string;
  categoryId?: string | null;
}

/**
 * Resuelve fila destino: reutiliza por dedupe de nombre en la sección, o crea
 * CATEGORY (con categoryId) / MANUAL.
 */
async function resolveOrCreateTargetRow(
  tenantId: string,
  rowId: string | null | undefined,
  newRow: NewRecurrenceRowInput | null | undefined,
): Promise<string> {
  if (newRow) {
    if (!PLAN_RECURRENCE_SECTIONS.has(newRow.section)) {
      throw new Error("Sección no admitida para recurrencia de plan");
    }
    const key = normalizeNameForDedupe(newRow.name);
    const existing = await prisma.financeFlowRow.findMany({
      where: { tenantId, section: newRow.section as never, archivedAt: null },
      select: { id: true, name: true },
    });
    const hit = existing.find((r) => normalizeNameForDedupe(r.name) === key);
    if (hit) {
      await assertPlanRecurrenceRow(tenantId, hit.id);
      return hit.id;
    }
    if (newRow.categoryId) {
      const cat = await prisma.financeCashflowCategory.findFirst({
        where: { id: newRow.categoryId, tenantId },
        select: { id: true },
      });
      if (!cat) throw new Error("Categoría no encontrada");
    }
    const last = await prisma.financeFlowRow.findFirst({
      where: { tenantId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const created = await prisma.financeFlowRow.create({
      data: {
        tenantId,
        section: newRow.section as never,
        name: newRow.name.trim(),
        mapping: newRow.categoryId ? "CATEGORY" : "MANUAL",
        categoryId: newRow.categoryId ?? null,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
      select: { id: true },
    });
    return created.id;
  }
  if (!rowId) throw new Error("rowId o newRow requerido");
  await assertPlanRecurrenceRow(tenantId, rowId);
  return rowId;
}

export async function createRecurrence(
  tenantId: string,
  rowId: string | null | undefined,
  input: RecurrenceInput & { newRow?: NewRecurrenceRowInput | null },
  createdBy: string | null,
): Promise<RecurrenceResult> {
  const resolvedRowId = await resolveOrCreateTargetRow(tenantId, rowId, input.newRow);
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  if (input.endAfterOccurrences != null && input.endAfterOccurrences < 1) {
    throw new Error("endAfterOccurrences debe ser ≥ 1");
  }
  const amountMode: FlowRecurrenceAmountMode = input.amountMode ?? "FIXED";
  if (amountMode === "PCT_SALES") {
    if (input.frequency !== "MONTHLY") {
      throw new Error("La recurrencia % ventas exige periodicidad mensual");
    }
    const frac = pctSalesFractionFromInput(input.pctSales);
    if (frac == null) throw new Error("pctSales debe estar entre 0 y 100");
    await replaceExistingPctSalesRule(tenantId, resolvedRowId);
    const rule = await prisma.financeFlowPlanRecurrence.create({
      data: {
        tenantId,
        rowId: resolvedRowId,
        amount: input.amount ?? 0,
        currency: "CLP",
        amountMode: "PCT_SALES",
        pctSales: frac,
        amountUf: null,
        ufPolicy: null,
        ufCustomDay: null,
        frequency: "MONTHLY",
        dayOfMonth: input.dayOfMonth ?? 1,
        startDate: ymdToDate(input.startDate)!,
        endDate: input.endDate ? ymdToDate(input.endDate) : null,
        endAfterOccurrences: input.endAfterOccurrences ?? null,
        createdBy,
      },
    });
    return { rule, cells: [] };
  }

  const currency: FlowPlanCurrency = input.currency ?? "CLP";
  if (currency === "UF" && !(input.amountUf != null && input.amountUf > 0)) {
    throw new Error("amountUf requerido para moneda UF");
  }
  // FINANCIAMIENTO: monto signado tal como viene (ingreso + / egreso −).
  // Otras secciones: magnitud positiva (el signo lo pone el ensamblado).
  const amountClp = await estimateClpForStorage(input);
  const rule = await prisma.financeFlowPlanRecurrence.create({
    data: {
      tenantId,
      rowId: resolvedRowId,
      amount: amountClp,
      currency,
      amountMode: "FIXED",
      pctSales: null,
      amountUf: currency === "UF" ? input.amountUf! : null,
      ufPolicy: currency === "UF" ? (input.ufPolicy ?? "RUN_DAY") : null,
      ufCustomDay: currency === "UF" && input.ufPolicy === "CUSTOM_DAY"
        ? (input.ufCustomDay ?? 1)
        : null,
      frequency: input.frequency,
      dayOfMonth: input.frequency === "MONTHLY" ? (input.dayOfMonth ?? null) : null,
      startDate: ymdToDate(input.startDate)!,
      endDate: input.endDate ? ymdToDate(input.endDate) : null,
      endAfterOccurrences: input.endAfterOccurrences ?? null,
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

  const amountMode: FlowRecurrenceAmountMode =
    input.amountMode ?? old.amountMode ?? "FIXED";
  const currency = input.currency ?? old.currency;
  const next = {
    amount: input.amount ?? Number(old.amount),
    currency,
    amountMode,
    pctSales:
      input.pctSales !== undefined
        ? input.pctSales
        : old.pctSales != null
          ? Number(old.pctSales) * 100
          : null,
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
    endAfterOccurrences:
      input.endAfterOccurrences !== undefined
        ? input.endAfterOccurrences
        : old.endAfterOccurrences,
  };
  if (next.endDate && next.endDate < next.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  if (next.endAfterOccurrences != null && next.endAfterOccurrences < 1) {
    throw new Error("endAfterOccurrences debe ser ≥ 1");
  }

  const currentWeek = weekStartYmd(new Date());
  const isFuture = (w: string) => w >= currentWeek;

  // Limpiar celdas futuras materializadas de la regla anterior (FIXED→PCT o edit FIXED).
  if (old.amountMode !== "PCT_SALES") {
    const oldFuture = occurrenceWeeks(old).filter(isFuture);
    if (oldFuture.length > 0) {
      await materializeClp(tenantId, old.rowId, oldFuture, 0, updatedBy);
    }
  }

  if (next.amountMode === "PCT_SALES") {
    if (next.frequency !== "MONTHLY") {
      throw new Error("La recurrencia % ventas exige periodicidad mensual");
    }
    const frac = pctSalesFractionFromInput(next.pctSales);
    if (frac == null) throw new Error("pctSales debe estar entre 0 y 100");
    await replaceExistingPctSalesRule(tenantId, old.rowId, old.id);
    const rule = await prisma.financeFlowPlanRecurrence.update({
      where: { id: old.id },
      data: {
        amount: next.amount,
        currency: "CLP",
        amountMode: "PCT_SALES",
        pctSales: frac,
        amountUf: null,
        ufPolicy: null,
        ufCustomDay: null,
        frequency: "MONTHLY",
        dayOfMonth: next.dayOfMonth ?? 1,
        startDate: ymdToDate(next.startDate)!,
        endDate: next.endDate ? ymdToDate(next.endDate) : null,
        endAfterOccurrences: next.endAfterOccurrences ?? null,
      },
    });
    return { rule, cells: [] };
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

  const rule = await prisma.financeFlowPlanRecurrence.update({
    where: { id: old.id },
    data: {
      amount: amountClp,
      currency: next.currency,
      amountMode: "FIXED",
      pctSales: null,
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
      endAfterOccurrences: next.endAfterOccurrences ?? null,
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

  if (!keepCells && rule.amountMode !== "PCT_SALES") {
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
