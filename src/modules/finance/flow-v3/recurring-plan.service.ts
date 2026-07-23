import "server-only";
import type { FinanceFlowPlanRecurrence, FlowRecurrenceFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toYmd, weekStartYmd, ymdToDate } from "./weeks";
import { bulkFill, type PlanCellDto } from "./plan.service";
import { listClosedV3Weeks } from "./weekly-close.adapter";

/**
 * Egresos recurrentes de PLAN (§5J). La regla se persiste
 * (FinanceFlowPlanRecurrence) y se materializa en celdas FinanceFlowPlanCell
 * normales hacia adelante. Editar reescribe SOLO las celdas futuras (semanas ≥
 * la semana actual); las pasadas nunca se tocan. Si se elimina la regla, las
 * celdas ya materializadas pueden conservarse (keepCells) o borrarse a futuro.
 *
 * Invariante de aislamiento: escribe únicamente en FinanceFlowPlanRecurrence y
 * (vía bulkFill) FinanceFlowPlanCell. Nunca en DTE/banco/programaciones.
 */

const EGRESO_SECTIONS = new Set(["REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS"]);

export interface RecurrenceInput {
  amount: number;
  frequency: FlowRecurrenceFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
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

/** Semanas ISO (lunes YMD) únicas de las ocurrencias de la regla. */
function occurrenceWeeks(rule: {
  frequency: FlowRecurrenceFrequency;
  startDate: Date;
  endDate: Date | null;
  dayOfMonth: number | null;
}): string[] {
  const startYmd = toYmd(rule.startDate);
  const endYmd = horizonEndYmd(rule.endDate ? toYmd(rule.endDate) : null);
  const dates = expandOccurrenceDates(rule.frequency, startYmd, endYmd, rule.dayOfMonth);
  return Array.from(new Set(dates.map((d) => weekStartYmd(ymdToDate(d)!))));
}

/** Escribe `amount` en las semanas dadas, saltando las selladas. */
async function materialize(
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
  const rule = await prisma.financeFlowPlanRecurrence.create({
    data: {
      tenantId,
      rowId,
      amount: input.amount,
      frequency: input.frequency,
      dayOfMonth: input.frequency === "MONTHLY" ? (input.dayOfMonth ?? null) : null,
      startDate: ymdToDate(input.startDate)!,
      endDate: input.endDate ? ymdToDate(input.endDate) : null,
      createdBy,
    },
  });
  const weeks = occurrenceWeeks(rule);
  const cells = await materialize(tenantId, rowId, weeks, Number(rule.amount), createdBy);
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

  const next = {
    amount: input.amount ?? Number(old.amount),
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

  const currentWeek = weekStartYmd(new Date());
  const isFuture = (w: string) => w >= currentWeek;

  // Solo el futuro se reescribe. Se limpian las celdas futuras de la regla
  // ANTERIOR y se materializan las de la nueva; el pasado queda intacto.
  const oldFuture = occurrenceWeeks(old).filter(isFuture);
  if (oldFuture.length > 0) await materialize(tenantId, old.rowId, oldFuture, 0, updatedBy);

  const rule = await prisma.financeFlowPlanRecurrence.update({
    where: { id: old.id },
    data: {
      amount: next.amount,
      frequency: next.frequency,
      dayOfMonth: next.frequency === "MONTHLY" ? (next.dayOfMonth ?? null) : null,
      startDate: ymdToDate(next.startDate)!,
      endDate: next.endDate ? ymdToDate(next.endDate) : null,
    },
  });

  const newFuture = occurrenceWeeks(rule).filter(isFuture);
  const cells = await materialize(tenantId, rule.rowId, newFuture, Number(rule.amount), updatedBy);
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
    if (future.length > 0) await materialize(tenantId, rule.rowId, future, 0, updatedBy);
  }
  await prisma.financeFlowPlanRecurrence.delete({ where: { id: rule.id } });
  return { deleted: true };
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
