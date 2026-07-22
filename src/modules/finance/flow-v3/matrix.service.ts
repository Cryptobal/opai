import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";
import {
  addWeeksUTC, defaultHorizon, enumerateWeeks, MAX_RANGE_WEEKS,
  startOfIsoWeekUTC, toYmd, weekStartYmd, ymdToDate,
} from "./weeks";
import { loadPlanCells } from "./plan.service";
import { loadCommittedIncome } from "./load-committed-income";
import { loadCommittedExpense } from "./load-committed-expense";
import { loadReal } from "./load-real";
import { normalizeRowName } from "./row-match";
import {
  UNMATCHED_EXPENSE_KEY, UNMATCHED_INCOME_KEY,
  type CommittedByRow, type FlowRowRef, type RealByRow,
} from "./types";
import { assembleMatrix, type AssembleRowInput } from "./matrix-assemble";
import { reduceMonthly, weeklyColumns } from "./matrix-monthly";
import type { FlowMatrixResponse } from "./matrix-types";

export type { FlowMatrixResponse } from "./matrix-types";

const SECTION_ORDER = ["INGRESOS", "REMUNERACIONES", "IMPUESTOS", "GAV", "FINANCIAMIENTO", "OTROS"];
/** Umbral de alerta del saldo (heat bar). TODO: configurable por tenant. */
const WARN_THRESHOLD_CLP = 8_000_000;

const VIRTUAL_ROWS = {
  [UNMATCHED_INCOME_KEY]: { id: "virtual:otros-ingresos", name: "Otros clientes", section: "INGRESOS" },
  [UNMATCHED_EXPENSE_KEY]: { id: "virtual:otros-gastos", name: "Otros gastos", section: "GAV" },
} as const;

/** Re-mapea los buckets sentinel a la fila canónica real (si existe) o virtual. */
function remapSentinels<T>(map: Map<string, T>, keyFor: (sentinel: string) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const [k, v] of map) {
    out.set(k === UNMATCHED_INCOME_KEY || k === UNMATCHED_EXPENSE_KEY ? keyFor(k) : k, v);
  }
  return out;
}

export async function buildFlowMatrix(
  tenantId: string,
  q: { from?: Date; to?: Date; granularity?: "week" | "month" },
): Promise<FlowMatrixResponse> {
  const today = new Date();
  const todayYmd = toYmd(today);
  const currentWeek = weekStartYmd(today);
  const def = defaultHorizon(today);
  const fromMonday = q.from ? startOfIsoWeekUTC(q.from) : def.from;
  let toMonday = q.to ? startOfIsoWeekUTC(q.to) : def.to;
  if (toMonday < fromMonday) toMonday = fromMonday;
  let weeks = enumerateWeeks(fromMonday, toMonday);
  if (weeks.length > MAX_RANGE_WEEKS) weeks = weeks.slice(0, MAX_RANGE_WEEKS);
  const lastWeek = weeks[weeks.length - 1];

  const dbRows = await prisma.financeFlowRow.findMany({ where: { tenantId } });
  const refs: FlowRowRef[] = dbRows.map((r) => ({
    id: r.id, name: r.name, section: r.section, mapping: r.mapping,
    crmAccountId: r.crmAccountId, installationId: r.installationId,
    categoryId: r.categoryId, supplierId: r.supplierId,
  }));

  const [plan, cIncome, cExpense, real, opening] = await Promise.all([
    loadPlanCells(tenantId, ymdToDate(weeks[0])!, ymdToDate(lastWeek)!),
    loadCommittedIncome(tenantId, refs, weeks, todayYmd),
    loadCommittedExpense(tenantId, refs, weeks, todayYmd),
    loadReal(tenantId, refs, weeks),
    resolveOpeningBalance(tenantId),
  ]);

  // Ventana enteramente pasada: real del gap (fin de ventana → hoy) para anclar el saldo.
  let realNetAfterWindow = 0;
  if (currentWeek > lastWeek) {
    const gapWeeks = enumerateWeeks(addWeeksUTC(ymdToDate(lastWeek)!, 1), ymdToDate(currentWeek)!);
    const gapReal = await loadReal(tenantId, refs, gapWeeks);
    for (const byWeek of gapReal.values())
      for (const cell of byWeek.values()) realNetAfterWindow += cell.total;
  }

  // Sentinels → fila canónica por nombre (si existe) o fila virtual.
  const byName = new Map(dbRows.filter((r) => !r.archivedAt).map((r) => [normalizeRowName(r.name), r.id]));
  const keyFor = (sentinel: string) => {
    const v = VIRTUAL_ROWS[sentinel as keyof typeof VIRTUAL_ROWS];
    return byName.get(normalizeRowName(v.name)) ?? v.id;
  };
  const committed: CommittedByRow = remapSentinels(cIncome, keyFor);
  for (const [k, byWeek] of remapSentinels(cExpense, keyFor)) {
    const target = committed.get(k);
    if (!target) committed.set(k, byWeek);
    else for (const [w, cell] of byWeek) {
      const t = target.get(w);
      if (!t) target.set(w, cell);
      else { t.total += cell.total; t.items.push(...cell.items); }
    }
  }
  const realResolved: RealByRow = remapSentinels(real, keyFor);

  const hasData = (rowId: string, cutoff: string | null) => {
    const check = (m: Map<string, Map<string, { total: number }>>) => {
      const byWeek = m.get(rowId);
      if (!byWeek) return false;
      for (const [w, cell] of byWeek) if ((cutoff == null || w <= cutoff) && cell.total !== 0) return true;
      return false;
    };
    return check(committed) || check(realResolved);
  };

  const assembleRows: AssembleRowInput[] = [];
  for (const r of dbRows) {
    const cutoff = r.archivedAt ? weekStartYmd(r.archivedAt) : null;
    if (r.archivedAt && !hasData(r.id, cutoff)) continue; // archivada sin movimiento en la ventana
    assembleRows.push({
      id: r.id, name: r.name, section: r.section, mapping: r.mapping,
      orderIndex: r.orderIndex, crmAccountId: r.crmAccountId, installationId: r.installationId,
      categoryId: r.categoryId, supplierId: r.supplierId,
      isArchived: !!r.archivedAt, archivedWeekCutoff: cutoff, isVirtual: false,
    });
  }
  for (const v of Object.values(VIRTUAL_ROWS)) {
    if (hasData(v.id, null)) {
      assembleRows.push({
        id: v.id, name: v.name, section: v.section, mapping: "MANUAL", orderIndex: 9999,
        crmAccountId: null, installationId: null, categoryId: null, supplierId: null,
        isArchived: false, archivedWeekCutoff: null, isVirtual: true,
      });
    }
  }
  assembleRows.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
      a.orderIndex - b.orderIndex ||
      a.name.localeCompare(b.name),
  );

  const assembled = assembleMatrix({
    rows: assembleRows, weeks, currentWeek,
    openingBalance: Math.round(opening.currentTotalClp),
    plan, committed, real: realResolved, realNetAfterWindow,
  });

  const base = {
    currentWeek, todayYmd,
    openingBalance: Math.round(opening.currentTotalClp),
    warnThreshold: WARN_THRESHOLD_CLP,
    kpis: assembled.kpis,
  };
  if (q.granularity === "month") {
    const m = reduceMonthly(weeks, currentWeek, assembled);
    return { granularity: "month", columns: m.columns, rows: m.rows, flows: m.flows, balances: m.balances, ...base };
  }
  return {
    granularity: "week",
    columns: weeklyColumns(weeks, currentWeek),
    rows: assembled.rows,
    flows: assembled.flows,
    balances: assembled.balances,
    ...base,
  };
}
