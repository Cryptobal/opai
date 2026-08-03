import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";
import {
  addWeeksUTC, defaultHorizon, enumerateWeeks, MAX_RANGE_WEEKS,
  startOfIsoWeekUTC, toYmd, weekStartYmd, ymdToDate,
} from "./weeks";
import { ensureFlowBootstrap } from "./bootstrap.service";
import { ensureIncomeRows } from "./ensure-income-rows.service";
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
  // Luego sync continuo: programaciones/clientes nuevos → fila propia
  // (evita que caigan en "Otros clientes"). Solo con permiso de gestión.
  if (q.allowBootstrap) {
    await ensureFlowBootstrap(tenantId);
    await ensureIncomeRows(tenantId);
  }

  const dbRows = await prisma.financeFlowRow.findMany({ where: { tenantId } });
  const refs: FlowRowRef[] = dbRows.map((r) => ({
    id: r.id, name: r.name, section: r.section, mapping: r.mapping,
    crmAccountId: r.crmAccountId, installationId: r.installationId,
    recurringTemplateId: r.recurringTemplateId,
    categoryId: r.categoryId, supplierId: r.supplierId,
  }));

  const [plan, cIncomeLoad, cExpense, real, opening, config, closedWeeks, seals] = await Promise.all([
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
  const cIncome = cIncomeLoad.committed;

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

  // Nombres canónicos desde la fuente (para detectar alias manuales).
  const accountIds = [...new Set(dbRows.map((r) => r.crmAccountId).filter(Boolean))] as string[];
  const installationIds = [...new Set(dbRows.map((r) => r.installationId).filter(Boolean))] as string[];
  const templateIds = [...new Set(dbRows.map((r) => r.recurringTemplateId).filter(Boolean))] as string[];
  const categoryIds = [...new Set(dbRows.map((r) => r.categoryId).filter(Boolean))] as string[];
  const supplierIds = [...new Set(dbRows.map((r) => r.supplierId).filter(Boolean))] as string[];
  const [accounts, installations, templateNames, categories, suppliers] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    installationIds.length
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    templateIds.length
      ? prisma.financeDteRecurringTemplate.findMany({
          where: { tenantId, id: { in: templateIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.financeCashflowCategory.findMany({
          where: { tenantId, id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    supplierIds.length
      ? prisma.financeSupplier.findMany({
          where: { tenantId, id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const installationNameById = new Map(installations.map((i) => [i.id, i.name]));
  const templateNameById = new Map(templateNames.map((t) => [t.id, t.name]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  const sourceNameFor = (r: (typeof dbRows)[number]): string | null => {
    if (r.mapping === "ACCOUNT_INSTALLATION") {
      // Fila de programación: el canónico es el nombre del template.
      if (r.recurringTemplateId) {
        return templateNameById.get(r.recurringTemplateId) ?? null;
      }
      if (!r.crmAccountId) return null;
      const acc = accountNameById.get(r.crmAccountId);
      if (!acc) return null;
      const inst = r.installationId ? installationNameById.get(r.installationId) : null;
      return inst ? `${acc} · ${inst}` : acc;
    }
    if (r.mapping === "CATEGORY" && r.categoryId) {
      return categoryNameById.get(r.categoryId) ?? null;
    }
    if (r.mapping === "SUPPLIER" && r.supplierId) {
      return supplierNameById.get(r.supplierId) ?? null;
    }
    return null;
  };

  // Captions UF (v4): una etiqueta por fila con egreso recurrente en UF.
  const ufRules = await prisma.financeFlowPlanRecurrence.findMany({
    where: { tenantId, currency: "UF", amountUf: { not: null } },
    select: { rowId: true, amountUf: true },
  });
  const ufCaptionByRow = new Map<string, string>();
  for (const rule of ufRules) {
    if (ufCaptionByRow.has(rule.rowId)) continue;
    const uf = Number(rule.amountUf);
    if (!(uf > 0)) continue;
    ufCaptionByRow.set(
      rule.rowId,
      `UF ${uf.toLocaleString("es-CL", { maximumFractionDigits: 4 })}`,
    );
  }

  const assembleRows: AssembleRowInput[] = [];
  for (const r of dbRows) {
    const cutoff = r.archivedAt ? weekStartYmd(r.archivedAt) : null;
    if (r.archivedAt && !hasData(r.id, cutoff)) continue; // archivada sin movimiento en la ventana
    const sourceName = sourceNameFor(r);
    const nameIsManual =
      sourceName != null && r.name.trim().localeCompare(sourceName.trim(), undefined, { sensitivity: "accent" }) !== 0;
    assembleRows.push({
      id: r.id, name: r.name, section: r.section, mapping: r.mapping,
      orderIndex: r.orderIndex, crmAccountId: r.crmAccountId, installationId: r.installationId,
      recurringTemplateId: r.recurringTemplateId,
      categoryId: r.categoryId, supplierId: r.supplierId,
      isArchived: !!r.archivedAt, archivedWeekCutoff: cutoff, isVirtual: false,
      sourceName, nameIsManual,
      ufCaption: ufCaptionByRow.get(r.id) ?? null,
    });
  }
  for (const v of Object.values(VIRTUAL_ROWS)) {
    if (hasData(v.id, null)) {
      assembleRows.push({
        id: v.id, name: v.name, section: v.section, mapping: "MANUAL", orderIndex: 9999,
        crmAccountId: null, installationId: null, recurringTemplateId: null,
        categoryId: null, supplierId: null,
        isArchived: false, archivedWeekCutoff: null, isVirtual: true,
        sourceName: null, nameIsManual: false,
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

  // Remap rowIds de exclusiones con el mismo criterio de sentinels.
  const excludedIncome = cIncomeLoad.excluded.map((e) => ({
    ...e,
    rowId:
      e.rowId === UNMATCHED_INCOME_KEY || e.rowId === UNMATCHED_EXPENSE_KEY
        ? keyFor(e.rowId)
        : e.rowId,
  }));

  const base = {
    currentWeek, todayYmd,
    openingBalance: Math.round(opening.currentTotalClp),
    openingBalanceDetail,
    closedWeeks,
    warnThreshold: config?.flowWarnThresholdClp ?? WARN_THRESHOLD_CLP,
    excludedIncome,
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
