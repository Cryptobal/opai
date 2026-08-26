import "server-only";
import type {
  FinanceFlowPlanRecurrence,
  FlowPlanCurrency,
  FlowRecurrenceAmountMode,
  FlowRecurrenceFrequency,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLatestPublishedUf, getUfValueForDate } from "@/lib/uf";
import { currentWeekYmd, toYmd, todayYmdChile, weekStartYmd, ymdToDate } from "./weeks";
import { bulkFill, upsertCell, type PlanCellDto } from "./plan.service";
import { listClosedV3Weeks } from "./weekly-close.adapter";
import { projectUfWithGrowth, ufTargetDate, ufToClp } from "./uf-occurrence";
import { normalizeNameForDedupe } from "./row-visibility";
import { stampCellNotes } from "./cell-note.service";
import { SUBROW_SECTIONS } from "./row-tree";

/**
 * Egresos recurrentes de PLAN (§5J / v4 UF). La regla se persiste
 * (FinanceFlowPlanRecurrence) y se materializa en celdas FinanceFlowPlanCell
 * normales hacia adelante. Editar reescribe SOLO las celdas futuras (semanas ≥
 * la semana actual); las pasadas nunca se tocan. Semanas selladas se saltan.
 *
 * currency=UF: cada ocurrencia resuelve CLP con la política UF y se materializa
 * como entero. rematerializeUfRecurrences recalcula futuras no selladas.
 *
 * Varias reglas FIXED no comparten fila: cada una vive en subfila (o hermana)
 * propia. Si ya había varias apiladas en una categoría (p. ej. T.G.R.), se
 * mueven todas al cargar la planilla, al crear/editar y en el cron; el padre
 * queda como cabecera y suma los meses superpuestos.
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
  /** Desglose del monto; se persiste en la regla y se estampa en celdas. */
  note?: string | null;
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

function normalizeRecurrenceNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const t = note.trim();
  return t ? t.slice(0, 2000) : null;
}

/** Estampa nota de la regla en las semanas materializadas (o en ocurrencias PCT). */
async function stampRuleNoteOnWeeks(
  tenantId: string,
  rule: FinanceFlowPlanRecurrence,
  weeks: string[],
  updatedBy: string | null,
  /** Si true, también borra cuando note es null/vacío. */
  clearIfEmpty: boolean,
): Promise<void> {
  if (weeks.length === 0) return;
  const body = normalizeRecurrenceNote(rule.note);
  if (!body && !clearIfEmpty) return;
  await stampCellNotes(tenantId, rule.rowId, weeks, body, updatedBy);
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

type RecurrenceNameInput = {
  amount: number;
  currency?: string | null;
  amountMode?: string | null;
  amountUf?: number | null;
  /** Porcentaje 0–100 (no fracción). */
  pctSales?: number | null;
  note?: string | null;
};

/** Nombre visible de la subfila dedicada a una recurrencia. */
export function dedicatedRecurrenceRowName(
  parentName: string,
  input: RecurrenceNameInput,
): string {
  const parent = parentName.trim() || "Recurrente";
  const note = input.note?.trim();
  let suffix: string;
  if (note) {
    suffix = note.length > 48 ? `${note.slice(0, 45)}…` : note;
  } else if (input.amountMode === "PCT_SALES" && input.pctSales != null) {
    suffix = `${input.pctSales}% ventas`;
  } else if (input.currency === "UF" && input.amountUf != null) {
    suffix = `${Number(input.amountUf).toLocaleString("es-CL", { maximumFractionDigits: 4 })} UF`;
  } else {
    suffix = `$${Math.round(Math.abs(Number(input.amount) || 0)).toLocaleString("es-CL")}`;
  }
  return `${parent} · ${suffix}`.slice(0, 120);
}

type RowAnchor = {
  id: string;
  name: string;
  section: string;
  parentId: string | null;
  canonicalKey: string | null;
};

/**
 * Dónde colgar la fila dedicada: hijo del ancla si admite subfilas;
 * si el ancla ya es hijo, hermano; si es canónica o sección sin árbol, hermana raíz.
 */
function attachParentIdForDedicatedRow(row: RowAnchor): string | null {
  if (row.parentId) return row.parentId;
  if (row.canonicalKey) return null;
  if (!SUBROW_SECTIONS.has(row.section)) return null;
  return row.id;
}

/** El ancla puede quedar como cabecera (rollup) y vaciarse de reglas FIXED. */
function shouldVacateAnchor(row: RowAnchor): boolean {
  return attachParentIdForDedicatedRow(row) === row.id;
}

function uniquifyRowName(base: string, taken: Set<string>): string {
  const key = (n: string) => normalizeNameForDedupe(n);
  if (!taken.has(key(base))) return base;
  for (let i = 2; i < 80; i++) {
    const candidate = `${base} (${i})`.slice(0, 120);
    if (!taken.has(key(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`.slice(0, 120);
}

async function createDedicatedRecurrenceRow(
  tenantId: string,
  anchor: RowAnchor,
  naming: RecurrenceNameInput,
): Promise<string> {
  const parentId = attachParentIdForDedicatedRow(anchor);
  const siblings = await prisma.financeFlowRow.findMany({
    where: parentId
      ? { tenantId, parentId }
      : { tenantId, section: anchor.section as never, parentId: null, archivedAt: null },
    select: { name: true },
  });
  const taken = new Set(siblings.map((s) => normalizeNameForDedupe(s.name)));
  const name = uniquifyRowName(dedicatedRecurrenceRowName(anchor.name, naming), taken);
  const last = await prisma.financeFlowRow.findFirst({
    where: { tenantId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const created = await prisma.financeFlowRow.create({
    data: {
      tenantId,
      section: anchor.section as never,
      name,
      mapping: "MANUAL",
      categoryId: null,
      parentId,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
    select: { id: true },
  });
  return created.id;
}

function namingFromRule(rule: FinanceFlowPlanRecurrence): RecurrenceNameInput {
  const frac = rule.pctSales != null ? Number(rule.pctSales) : null;
  return {
    amount: Number(rule.amount),
    currency: rule.currency,
    amountMode: rule.amountMode ?? "FIXED",
    amountUf: rule.amountUf != null ? Number(rule.amountUf) : null,
    pctSales: frac != null && Number.isFinite(frac) ? Math.round(frac * 10_000) / 100 : null,
    note: rule.note,
  };
}

async function loadRowAnchor(tenantId: string, rowId: string): Promise<RowAnchor> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true, name: true, section: true, parentId: true, canonicalKey: true },
  });
  if (!row) throw new Error("Fila no encontrada");
  return {
    id: row.id,
    name: row.name,
    section: row.section,
    parentId: row.parentId,
    canonicalKey: row.canonicalKey,
  };
}

/**
 * Mueve reglas FIXED a filas dedicadas y rematerializa futuras no selladas.
 * En el ancla original deja 0 en esas semanas (no pisa otras filas).
 */
async function relocateFixedRulesToDedicatedRows(
  tenantId: string,
  sourceRowId: string,
  anchor: RowAnchor,
  rules: FinanceFlowPlanRecurrence[],
  updatedBy: string | null,
): Promise<void> {
  if (rules.length === 0) return;
  const currentWeek = currentWeekYmd();
  const isFuture = (w: string) => w >= currentWeek;
  for (const rule of rules) {
    const dedicatedId = await createDedicatedRecurrenceRow(
      tenantId,
      anchor,
      namingFromRule(rule),
    );
    const moved = await prisma.financeFlowPlanRecurrence.update({
      where: { id: rule.id },
      data: { rowId: dedicatedId },
    });
    const extraFuture = occurrenceWeeks(moved).filter(isFuture);
    if (extraFuture.length > 0) {
      await materializeClp(tenantId, sourceRowId, extraFuture, 0, updatedBy);
    }
    const cells = await materializeRule(tenantId, moved, extraFuture, updatedBy);
    const stampWeeks = cells.length > 0 ? cells.map((c) => c.weekStart) : extraFuture;
    await stampRuleNoteOnWeeks(tenantId, moved, stampWeeks, updatedBy, false);
  }
}

/**
 * Si una fila tiene 2+ recurrencias FIXED, las separa a subfilas (o hermanas).
 * En categorías que admiten árbol (p. ej. T.G.R. en Impuestos) se mueven
 * TODAS, incluida la primera, para que el padre quede como cabecera y sume.
 */
export async function splitStackedRecurrencesOnRow(
  tenantId: string,
  rowId: string,
  updatedBy: string | null,
): Promise<number> {
  const rules = await prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, rowId, amountMode: "FIXED" },
    orderBy: { createdAt: "asc" },
  });
  if (rules.length <= 1) return rules.length;

  const anchor = await loadRowAnchor(tenantId, rowId);
  const toMove = shouldVacateAnchor(anchor) ? rules : rules.slice(1);
  await relocateFixedRulesToDedicatedRows(tenantId, rowId, anchor, toMove, updatedBy);
  return rules.length - toMove.length;
}

/** Reparte recurrencias apiladas en todas las filas del tenant (bootstrap / cron). */
export async function splitStackedRecurrencesForTenant(
  tenantId: string,
  updatedBy: string | null = null,
): Promise<{ rows: number }> {
  const rules = await prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, amountMode: "FIXED" },
    select: { rowId: true },
  });
  const counts = new Map<string, number>();
  for (const r of rules) counts.set(r.rowId, (counts.get(r.rowId) ?? 0) + 1);
  const stacked = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  for (const rowId of stacked) {
    await splitStackedRecurrencesOnRow(tenantId, rowId, updatedBy);
  }
  return { rows: stacked.length };
}

async function refreshRuleAfterSplit(
  tenantId: string,
  ruleId: string,
  updatedBy: string | null,
): Promise<FinanceFlowPlanRecurrence> {
  const rule = await prisma.financeFlowPlanRecurrence.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!rule) throw new Error("Regla recurrente no encontrada");
  await splitStackedRecurrencesOnRow(tenantId, rule.rowId, updatedBy);
  const fresh = await prisma.financeFlowPlanRecurrence.findFirst({
    where: { id: ruleId, tenantId },
  });
  if (!fresh) throw new Error("Regla recurrente no encontrada");
  return fresh;
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
  note: string | null;
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
    note: r.note?.trim() || null,
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
  await splitStackedRecurrencesOnRow(tenantId, resolvedRowId, createdBy);
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  if (input.endAfterOccurrences != null && input.endAfterOccurrences < 1) {
    throw new Error("endAfterOccurrences debe ser ≥ 1");
  }
  const amountMode: FlowRecurrenceAmountMode = input.amountMode ?? "FIXED";
  let targetRowId = resolvedRowId;
  if (amountMode !== "PCT_SALES") {
    const existingFixed = await prisma.financeFlowPlanRecurrence.findMany({
      where: { tenantId, rowId: resolvedRowId, amountMode: "FIXED" },
      orderBy: { createdAt: "asc" },
    });
    const anchor = await loadRowAnchor(tenantId, resolvedRowId);
    const vacate = shouldVacateAnchor(anchor);
    if (existingFixed.length >= 1 && vacate) {
      await relocateFixedRulesToDedicatedRows(
        tenantId,
        resolvedRowId,
        anchor,
        existingFixed,
        createdBy,
      );
      targetRowId = await createDedicatedRecurrenceRow(tenantId, anchor, {
        amount: input.amount,
        currency: input.currency ?? "CLP",
        amountMode,
        amountUf: input.amountUf,
        pctSales: input.pctSales,
        note: input.note,
      });
    } else if (existingFixed.length >= 1) {
      targetRowId = await createDedicatedRecurrenceRow(tenantId, anchor, {
        amount: input.amount,
        currency: input.currency ?? "CLP",
        amountMode,
        amountUf: input.amountUf,
        pctSales: input.pctSales,
        note: input.note,
      });
    } else if (vacate) {
      const kids = await prisma.financeFlowRow.findMany({
        where: { tenantId, parentId: resolvedRowId },
        select: { id: true },
        take: 1,
      });
      if (kids.length > 0) {
        targetRowId = await createDedicatedRecurrenceRow(tenantId, anchor, {
          amount: input.amount,
          currency: input.currency ?? "CLP",
          amountMode,
          amountUf: input.amountUf,
          pctSales: input.pctSales,
          note: input.note,
        });
      }
    }
  }
  if (amountMode === "PCT_SALES") {
    if (input.frequency !== "MONTHLY") {
      throw new Error("La recurrencia % ventas exige periodicidad mensual");
    }
    const frac = pctSalesFractionFromInput(input.pctSales);
    if (frac == null) throw new Error("pctSales debe estar entre 0 y 100");
    await replaceExistingPctSalesRule(tenantId, targetRowId);
    const note = normalizeRecurrenceNote(input.note);
    const rule = await prisma.financeFlowPlanRecurrence.create({
      data: {
        tenantId,
        rowId: targetRowId,
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
        note,
        createdBy,
      },
    });
    const weeks = occurrenceWeeks(rule);
    await stampRuleNoteOnWeeks(tenantId, rule, weeks, createdBy, true);
    return { rule, cells: [] };
  }

  const currency: FlowPlanCurrency = input.currency ?? "CLP";
  if (currency === "UF" && !(input.amountUf != null && input.amountUf > 0)) {
    throw new Error("amountUf requerido para moneda UF");
  }
  // FINANCIAMIENTO: monto signado tal como viene (ingreso + / egreso −).
  // Otras secciones: magnitud positiva (el signo lo pone el ensamblado).
  const amountClp = await estimateClpForStorage(input);
  const note = normalizeRecurrenceNote(input.note);
  const rule = await prisma.financeFlowPlanRecurrence.create({
    data: {
      tenantId,
      rowId: targetRowId,
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
      note,
      createdBy,
    },
  });
  const weeks = occurrenceWeeks(rule);
  const cells = await materializeRule(tenantId, rule, weeks, createdBy);
  const stampWeeks = cells.length > 0 ? cells.map((c) => c.weekStart) : weeks;
  await stampRuleNoteOnWeeks(tenantId, rule, stampWeeks, createdBy, true);
  return { rule, cells };
}

export async function updateRecurrence(
  tenantId: string,
  ruleId: string,
  input: Partial<RecurrenceInput>,
  updatedBy: string | null,
): Promise<RecurrenceResult> {
  const old = await refreshRuleAfterSplit(tenantId, ruleId, updatedBy);

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
  const nextNote =
    input.note !== undefined
      ? normalizeRecurrenceNote(input.note)
      : normalizeRecurrenceNote(old.note);
  if (next.endDate && next.endDate < next.startDate) {
    throw new Error("endDate no puede ser anterior a startDate");
  }
  if (next.endAfterOccurrences != null && next.endAfterOccurrences < 1) {
    throw new Error("endAfterOccurrences debe ser ≥ 1");
  }

  const currentWeek = currentWeekYmd();
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
        note: nextNote,
      },
    });
    const weeks = occurrenceWeeks(rule).filter(isFuture);
    await stampRuleNoteOnWeeks(tenantId, rule, weeks, updatedBy, input.note !== undefined);
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
      note: nextNote,
    },
  });

  const newFuture = occurrenceWeeks(rule).filter(isFuture);
  const cells = await materializeRule(tenantId, rule, newFuture, updatedBy);
  const stampWeeks = cells.length > 0 ? cells.map((c) => c.weekStart) : newFuture;
  await stampRuleNoteOnWeeks(
    tenantId,
    rule,
    stampWeeks,
    updatedBy,
    input.note !== undefined,
  );
  return { rule, cells };
}

export async function deleteRecurrence(
  tenantId: string,
  ruleId: string,
  keepCells: boolean,
  updatedBy: string | null,
): Promise<{ deleted: true }> {
  const rule = await refreshRuleAfterSplit(tenantId, ruleId, updatedBy);

  if (!keepCells && rule.amountMode !== "PCT_SALES") {
    const currentWeek = currentWeekYmd();
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
  const currentWeek = currentWeekYmd();
  let cells = 0;
  for (const rule of rules) {
    if (rule.endDate && toYmd(rule.endDate) < todayYmdChile()) continue;
    const future = occurrenceWeeks(rule).filter((w) => w >= currentWeek);
    const written = await materializeRule(tenantId, rule, future, null);
    cells += written.length;
    if (rule.note?.trim()) {
      const stampWeeks = written.length > 0 ? written.map((c) => c.weekStart) : future;
      await stampRuleNoteOnWeeks(tenantId, rule, stampWeeks, null, false);
    }
  }
  return { rules: rules.length, cells };
}

/** Reglas recurrentes de una fila y de sus subfilas (para editarlas desde el menú). */
export async function listRecurrencesForRow(
  tenantId: string,
  rowId: string,
): Promise<FinanceFlowPlanRecurrence[]> {
  const children = await prisma.financeFlowRow.findMany({
    where: { tenantId, parentId: rowId },
    select: { id: true },
  });
  const rowIds = [rowId, ...children.map((c) => c.id)];
  return prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, rowId: { in: rowIds } },
    orderBy: { createdAt: "asc" },
  });
}
