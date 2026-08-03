import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";
import {
  addWeeksUTC, defaultHorizon, enumerateWeeks, MAX_RANGE_WEEKS,
  startOfIsoWeekUTC, toYmd, weekStartYmd, ymdToDate,
} from "./weeks";
import { ensureFlowBootstrap } from "./bootstrap.service";
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
import { listClosedV3Weeks, loadSealedBalancesForMatrix } from "./weekly-close.adapter";
import type { FlowMatrixResponse, OpeningBalanceDetail } from "./matrix-types";
import { compareFlowRows } from "./row-sort";

export type { FlowMatrixResponse } from "./matrix-types";

/** Fallback del umbral de alerta del saldo si el tenant no tiene config (F2). */
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
  q: { from?: Date; to?: Date; granularity?: "week" | "month"; allowBootstrap?: boolean },
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

  // Primera vez sin filas: bootstrap automático (programaciones activas +
  // canónicas + backfill de términos por contrato). Nadie corre scripts.
  // Solo lo dispara un usuario con permiso de gestión: este GET no debe
  // escribir cuando lo abre alguien de solo-lectura.
  if (q.allowBootstrap) await ensureFlowBootstrap(tenantId);

  const dbRows = await prisma.financeFlowRow.findMany({ where: { tenantId } });
  const refs: FlowRowRef[] = dbRows.map((r) => ({
    id: r.id, name: r.name, section: r.section, mapping: r.mapping,
    crmAccountId: r.crmAccountId, installationId: r.installationId,
    categoryId: r.categoryId, supplierId: r.supplierId,
  }));

  const [plan, cIncome, cExpense, real, opening, config, closedWeeks, seals] = await Promise.all([
    loadPlanCells(tenantId, ymdToDate(weeks[0])!, ymdToDate(lastWeek)!),
    loadCommittedIncome(tenantId, refs, weeks, todayYmd),
    loadCommittedExpense(tenantId, refs, weeks, todayYmd),
    loadReal(tenantId, refs, weeks),
    resolveOpeningBalance(tenantId),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { flowWarnThresholdClp: true },
    }),
    listClosedV3Weeks(tenantId, weeks),
    loadSealedBalancesForMatrix(tenantId, weeks),
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
  // Presentación A→Z por sección; virtuales ("Otros clientes") al final.
  // orderIndex se conserva en datos pero no define el orden visible.
  assembleRows.sort(compareFlowRows);

  const assembled = assembleMatrix({
    rows: assembleRows, weeks, currentWeek,
    openingBalance: Math.round(opening.currentTotalClp),
    plan, committed, real: realResolved, realNetAfterWindow,
    sealedBalances: seals.sealedBalances,
    priorSealed: seals.priorSealed,
  });

  // Desglose bancario por cuenta (§5H). El número SIEMPRE se enmascara a los
  // últimos 4 dígitos: nunca sale el número completo al cliente.
  const maskAccount = (n: string): string => {
    const last4 = (n ?? "").replace(/\D/g, "").slice(-4);
    return last4 ? `••${last4}` : "••••";
  };
  const perAccount = opening.perAccount.map((a) => ({
    bankName: a.bankName,
    accountMasked: maskAccount(a.accountNumber),
    balanceClp: Math.round(a.resolvedBalanceClp),
    lastSnapshotYmd: a.anchorSnapshotDate ? a.anchorSnapshotDate.toISOString().slice(0, 10) : null,
  }));
  const lastSnapshotYmd = perAccount.reduce<string | null>(
    (acc, a) => (a.lastSnapshotYmd && (!acc || a.lastSnapshotYmd > acc) ? a.lastSnapshotYmd : acc),
    null,
  );
  const openingBalanceDetail: OpeningBalanceDetail = {
    totalClp: Math.round(opening.currentTotalClp),
    perAccount,
    lastSnapshotYmd,
  };

  const base = {
    currentWeek, todayYmd,
    openingBalance: Math.round(opening.currentTotalClp),
    openingBalanceDetail,
    closedWeeks,
    warnThreshold: config?.flowWarnThresholdClp ?? WARN_THRESHOLD_CLP,
    kpis: assembled.kpis,
  };
  if (q.granularity === "month") {
    const m = reduceMonthly(weeks, currentWeek, assembled);
    return {
      granularity: "month",
      columns: m.columns,
      rows: m.rows,
      flows: m.flows,
      balances: m.balances,
      balanceBreaks: m.balanceBreaks,
      ...base,
    };
  }
  return {
    granularity: "week",
    columns: weeklyColumns(weeks, currentWeek),
    rows: assembled.rows,
    flows: assembled.flows,
    balances: assembled.balances,
    balanceBreaks: assembled.balanceBreaks,
    ...base,
  };
}
