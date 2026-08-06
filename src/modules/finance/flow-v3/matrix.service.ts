import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";
import {
  addWeeksUTC, defaultHorizon, enumerateWeeks, MAX_RANGE_WEEKS,
  startOfIsoWeekUTC, toYmd, weekStartYmd, ymdToDate,
} from "./weeks";
import { ensureFlowBootstrap } from "./bootstrap.service";
import { reconcileIncomeRows } from "./reconcile-income-rows.service";
import { FALLBACK_EXPENSE_NAME, FALLBACK_INCOME_NAME } from "./canonical-rows";
import { loadPlanCells } from "./plan.service";
import { loadCellNotes } from "./cell-note.service";
import { loadCellSettlements } from "./cell-settlement.service";
import { loadCommittedIncome } from "./load-committed-income";
import { loadCommittedExpense } from "./load-committed-expense";
import { loadReal } from "./load-real";
import { normalizeRowName } from "./row-match";
import { shouldIncludeFlowRow, type ActiveTemplateRef } from "./row-visibility";
import {
  UNMATCHED_EXPENSE_KEY, UNMATCHED_INCOME_KEY,
  type CommittedByRow, type FlowRowRef, type RealByRow,
} from "./types";
import { assembleMatrix, type AssembleRowInput } from "./matrix-assemble";
import { reduceMonthly, weeklyColumns } from "./matrix-monthly";
import { listClosedV3Weeks, loadSealedBalancesForMatrix } from "./weekly-close.adapter";
import type { FlowMatrixResponse, OpeningBalanceDetail } from "./matrix-types";
import { compareFlowRows } from "./row-sort";
import { isFallbackBandejaRow } from "./unmatched-count";

export type { FlowMatrixResponse } from "./matrix-types";

/** Fallback del umbral de alerta del saldo si el tenant no tiene config (F2). */
const WARN_THRESHOLD_CLP = 8_000_000;

const VIRTUAL_ROWS = {
  [UNMATCHED_INCOME_KEY]: { id: "virtual:otros-ingresos", name: FALLBACK_INCOME_NAME, section: "INGRESOS" },
  [UNMATCHED_EXPENSE_KEY]: { id: "virtual:otros-gastos", name: FALLBACK_EXPENSE_NAME, section: "GAV" },
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
  // canónicas + backfill de términos por contrato). Luego reconcile:
  // adoptar/archivar/canónicas (sin crear filas por DTE suelto).
  if (q.allowBootstrap) {
    await ensureFlowBootstrap(tenantId);
    await reconcileIncomeRows(tenantId);
  }

  const dbRows = await prisma.financeFlowRow.findMany({ where: { tenantId } });
  // Matcher solo con filas activas: archivadas no capturan DTEs (van a
  // template u "Otros ingresos"). Plan/histórico de archivadas sigue en BD.
  const activeRefs: FlowRowRef[] = dbRows
    .filter((r) => !r.archivedAt)
    .map((r) => ({
      id: r.id, name: r.name, section: r.section, mapping: r.mapping,
      crmAccountId: r.crmAccountId, installationId: r.installationId,
      recurringTemplateId: r.recurringTemplateId,
      categoryId: r.categoryId, canonicalKey: r.canonicalKey,
      supplierId: r.supplierId,
    }));

  const [plan, notes, settlements, cIncomeLoad, cExpense, real, opening, config, closedWeeks, seals] = await Promise.all([
    loadPlanCells(tenantId, ymdToDate(weeks[0])!, ymdToDate(lastWeek)!),
    loadCellNotes(tenantId, ymdToDate(weeks[0])!, ymdToDate(lastWeek)!),
    loadCellSettlements(tenantId, ymdToDate(weeks[0])!, ymdToDate(lastWeek)!),
    loadCommittedIncome(tenantId, activeRefs, weeks, todayYmd),
    loadCommittedExpense(tenantId, activeRefs, weeks, todayYmd),
    loadReal(tenantId, activeRefs, weeks),
    resolveOpeningBalance(tenantId),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: {
        flowWarnThresholdClp: true,
        driftAlertThresholdClp: true,
        residualCarryEnabled: true,
        residualMinClp: true,
      },
    }),
    listClosedV3Weeks(tenantId, weeks),
    loadSealedBalancesForMatrix(tenantId, weeks),
  ]);
  const cIncome = cIncomeLoad.committed;

  // Ventana enteramente pasada: real del gap (fin de ventana → hoy) para anclar el saldo.
  let realNetAfterWindow = 0;
  if (currentWeek > lastWeek) {
    const gapWeeks = enumerateWeeks(addWeeksUTC(ymdToDate(lastWeek)!, 1), ymdToDate(currentWeek)!);
    const gapReal = await loadReal(tenantId, activeRefs, gapWeeks);
    for (const byWeek of gapReal.values())
      for (const cell of byWeek.values()) realNetAfterWindow += cell.total;
  }

  // Sentinels → fila bandeja por canonicalKey (si existe) o nombre / virtual.
  const activeRows = dbRows.filter((r) => !r.archivedAt);
  const bandejaIngresoId = activeRows.find((r) => r.canonicalKey === "BANDEJA_INGRESO")?.id;
  const bandejaEgresoId = activeRows.find((r) => r.canonicalKey === "BANDEJA_EGRESO")?.id;
  const byName = new Map(activeRows.map((r) => [normalizeRowName(r.name), r.id]));
  const keyFor = (sentinel: string) => {
    if (sentinel === UNMATCHED_INCOME_KEY) {
      return bandejaIngresoId
        ?? byName.get(normalizeRowName(FALLBACK_INCOME_NAME))
        ?? VIRTUAL_ROWS[UNMATCHED_INCOME_KEY].id;
    }
    if (sentinel === UNMATCHED_EXPENSE_KEY) {
      return bandejaEgresoId
        ?? byName.get(normalizeRowName(FALLBACK_EXPENSE_NAME))
        ?? VIRTUAL_ROWS[UNMATCHED_EXPENSE_KEY].id;
    }
    return sentinel;
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

  const hasLayerData = (
    rowId: string,
    cutoff: string | null,
    m: Map<string, Map<string, { total: number }>>,
  ) => {
    const byWeek = m.get(rowId);
    if (!byWeek) return false;
    for (const [w, cell] of byWeek) {
      if ((cutoff == null || w <= cutoff) && cell.total !== 0) return true;
    }
    return false;
  };
  const hasPlanData = (rowId: string, cutoff: string | null) => {
    const byWeek = plan.get(rowId);
    if (!byWeek) return false;
    for (const [w, amount] of byWeek) {
      if ((cutoff == null || w <= cutoff) && amount !== 0) return true;
    }
    return false;
  };
  const hasAnyData = (rowId: string, cutoff: string | null) =>
    hasLayerData(rowId, cutoff, committed) ||
    hasLayerData(rowId, cutoff, realResolved) ||
    hasPlanData(rowId, cutoff);

  // Nombres canónicos desde la fuente (para detectar alias manuales).
  const accountIds = [...new Set(dbRows.map((r) => r.crmAccountId).filter(Boolean))] as string[];
  const installationIds = [...new Set(dbRows.map((r) => r.installationId).filter(Boolean))] as string[];
  const templateIds = [...new Set(dbRows.map((r) => r.recurringTemplateId).filter(Boolean))] as string[];
  const supplierIds = [...new Set(dbRows.map((r) => r.supplierId).filter(Boolean))] as string[];
  const rowIds = dbRows.map((r) => r.id);
  const [accounts, installations, templatesMeta, suppliers, primaryAccounts] = await Promise.all([
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
          select: { id: true, name: true, isActive: true, endDate: true },
        })
      : Promise.resolve([]),
    supplierIds.length
      ? prisma.financeSupplier.findMany({
          where: { tenantId, id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    rowIds.length
      ? prisma.financeFlowRowAccount.findMany({
          where: { tenantId, rowId: { in: rowIds }, isPrimary: true },
          select: {
            rowId: true,
            accountPlan: { select: { code: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const installationNameById = new Map(installations.map((i) => [i.id, i.name]));
  const templateNameById = new Map(templatesMeta.map((t) => [t.id, t.name]));
  const templateActiveById = new Map<string, ActiveTemplateRef>(
    templatesMeta.map((t) => [
      t.id,
      {
        id: t.id,
        isActive: t.isActive,
        endDateYmd: t.endDate ? toYmd(t.endDate) : null,
      },
    ]),
  );
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
  const primaryAccountLabelByRow = new Map(
    primaryAccounts.map((m) => [
      m.rowId,
      `${m.accountPlan.code} · ${m.accountPlan.name}`,
    ]),
  );
  const windowStartYmd = weeks[0]!;

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
    if ((r.mapping === "ACCOUNTS" || r.mapping === "CATEGORY") && primaryAccountLabelByRow.has(r.id)) {
      return primaryAccountLabelByRow.get(r.id) ?? null;
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
    const tpl = r.recurringTemplateId
      ? templateActiveById.get(r.recurringTemplateId) ?? null
      : null;
    // Template eliminado físicamente → huérfano: tratar como sin template
    // (solo regla b: datos en ventana).
    const include = shouldIncludeFlowRow({
      row: {
        id: r.id,
        mapping: r.mapping,
        archivedAt: r.archivedAt,
        recurringTemplateId: r.recurringTemplateId,
        isCanonicalFallback:
          r.canonicalKey === "BANDEJA_INGRESO" ||
          r.canonicalKey === "BANDEJA_EGRESO" ||
          isFallbackBandejaRow({ name: r.name, canonicalKey: r.canonicalKey }),
      },
      windowStartYmd,
      hasDataInWindow: hasAnyData(r.id, null),
      hasDataBeforeCutoff: cutoff != null ? hasAnyData(r.id, cutoff) : false,
      archivedCutoffYmd: cutoff,
      template: tpl,
    });
    if (!include) continue;
    const sourceName = sourceNameFor(r);
    const nameIsManual =
      sourceName != null && r.name.trim().localeCompare(sourceName.trim(), undefined, { sensitivity: "accent" }) !== 0;
    assembleRows.push({
      id: r.id, name: r.name, section: r.section, mapping: r.mapping,
      orderIndex: r.orderIndex, crmAccountId: r.crmAccountId, installationId: r.installationId,
      recurringTemplateId: r.recurringTemplateId,
      categoryId: r.categoryId, canonicalKey: r.canonicalKey, supplierId: r.supplierId,
      isArchived: !!r.archivedAt, archivedWeekCutoff: cutoff, isVirtual: false,
      sourceName, nameIsManual,
      ufCaption: ufCaptionByRow.get(r.id) ?? null,
    });
  }
  for (const v of Object.values(VIRTUAL_ROWS)) {
    if (hasAnyData(v.id, null)) {
      assembleRows.push({
        id: v.id, name: v.name, section: v.section, mapping: "MANUAL", orderIndex: 9999,
        crmAccountId: null, installationId: null, recurringTemplateId: null,
        categoryId: null, canonicalKey: null, supplierId: null,
        isArchived: false, archivedWeekCutoff: null, isVirtual: true,
        sourceName: null, nameIsManual: false,
      });
    }
  }
  // Presentación v4.8: sección → cuenta/prog → manual → bandeja → virtual,
  // A→Z dentro de cada bloque. orderIndex se conserva pero no define el orden.
  assembleRows.sort((a, b) =>
    compareFlowRows(
      {
        section: a.section,
        name: a.name,
        isVirtual: a.isVirtual,
        mapping: a.mapping,
        isBandeja: isFallbackBandejaRow(a),
        id: a.id,
      },
      {
        section: b.section,
        name: b.name,
        isVirtual: b.isVirtual,
        mapping: b.mapping,
        isBandeja: isFallbackBandejaRow(b),
        id: b.id,
      },
    ),
  );

  const residualCarryEnabled = config?.residualCarryEnabled !== false;
  const residualMinClp = config?.residualMinClp ?? 10_000;

  const assembled = assembleMatrix({
    rows: assembleRows, weeks, currentWeek,
    openingBalance: Math.round(opening.currentTotalClp),
    plan, notes, settlements, committed, real: realResolved, realNetAfterWindow,
    sealedBalances: seals.sealedBalances,
    priorSealed: seals.priorSealed,
    residualCarryEnabled,
    residualMinClp,
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
    driftAlertThresholdClp: config?.driftAlertThresholdClp ?? 100_000,
    residualCarryEnabled,
    residualMinClp,
    excludedIncome,
    unroutedIncome: cIncomeLoad.unroutedIncome,
    kpis: assembled.kpis,
  };
  if (q.granularity === "month") {
    const m = reduceMonthly(weeks, currentWeek, assembled, {
      sealedBalances: seals.sealedBalances,
      priorSealed: seals.priorSealed,
      realNetAfterWindow,
      residualCarryEnabled,
      residualMinClp,
    });
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
