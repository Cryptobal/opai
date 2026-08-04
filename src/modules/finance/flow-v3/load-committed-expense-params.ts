import "server-only";
import { prisma } from "@/lib/prisma";
import { computeF29Period } from "@/modules/finance/billing/f29.service";
import { loadPlanCells } from "./plan.service";
import { loadCommittedIncome } from "./load-committed-income";
import {
  applyTeDiscountToLiquido,
  computeF29FutureClp,
  computeFiniquitosMonthly,
  computeRetiroSocioClp,
  computeTeHistoricalWeekly,
  computeTePctPayrollWeekly,
  payWeekForMonthDay,
} from "./derive-committed-expense-params";
import type {
  ExpenseMilestoneInput,
  TeWeeklyProjectionInput,
} from "./derive-committed-expense";
import { normalizeRowName } from "./row-match";
import { loadReal } from "./load-real";
import { weekStartYmd, ymdToDate, enumerateWeeks } from "./weeks";
import type { FlowRowRef } from "./types";

export interface PayrollMilestonePatch {
  key: "liquido" | "previred";
  dateYmd: string;
  amountClp: number;
  label: string;
  metaNote?: string;
}

export interface ExpenseParametricsResult {
  milestones: ExpenseMilestoneInput[];
  teWeeklyProjections: TeWeeklyProjectionInput[];
  tePlanBlockedWeeks: Set<string>;
  teRowId: string | null;
  payrollPatches: PayrollMilestonePatch[];
}

function ymdOf(y: number, monthZeroIdx: number, day: number): string {
  const last = new Date(Date.UTC(y, monthZeroIdx + 1, 0)).getUTCDate();
  const d = day === -1 ? last : Math.min(Math.max(day, 1), last);
  return new Date(Date.UTC(y, monthZeroIdx, d)).toISOString().slice(0, 10);
}

function monthsBetween(fromYmd: string, toYmd: string): Array<{ y: number; m: number }> {
  const [fy, fm] = fromYmd.split("-").map(Number);
  const [ty, tm] = toYmd.split("-").map(Number);
  const out: Array<{ y: number; m: number }> = [];
  let y = fy;
  let m = fm - 1;
  while (y < ty || (y === ty && m <= tm - 1)) {
    out.push({ y, m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function monthEndYmd(y: number, monthZeroIdx: number): string {
  const last = new Date(Date.UTC(y, monthZeroIdx + 1, 0)).getUTCDate();
  return ymdOf(y, monthZeroIdx, last);
}

function weeksInCalendarMonth(year: number, monthZeroIdx: number): number {
  const start = new Date(Date.UTC(year, monthZeroIdx, 1));
  const end = new Date(Date.UTC(year, monthZeroIdx + 1, 0));
  return enumerateWeeks(start, end).length;
}

function periodoKey(y: number, monthZeroIdx: number): string {
  return `${y}-${String(monthZeroIdx + 1).padStart(2, "0")}`;
}

function prevMonth(y: number, m: number): { y: number; m: number } {
  if (m === 0) return { y: y - 1, m: 11 };
  return { y, m: m - 1 };
}

async function sumIssuedNetSalesForMonth(
  tenantId: string,
  y: number,
  monthZeroIdx: number,
): Promise<number> {
  const start = new Date(Date.UTC(y, monthZeroIdx, 1));
  const end = new Date(Date.UTC(y, monthZeroIdx + 1, 1));
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      dteType: { in: [33, 34] },
      date: { gte: start, lt: end },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
    },
    select: { netAmount: true, totalAmount: true, dteType: true },
  });
  let sum = 0;
  for (const d of dtes) {
    const net = Number(d.netAmount);
    if (net > 0) sum += net;
    else if (d.dteType === 33) sum += Math.round(Number(d.totalAmount) / 1.19);
    else sum += Number(d.totalAmount);
  }
  return Math.round(sum);
}

async function sumIncomeFlowForMonth(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  y: number,
  monthZeroIdx: number,
): Promise<number> {
  const monthPrefix = periodoKey(y, monthZeroIdx);
  const monthWeeks = weeks.filter((w) => w.startsWith(monthPrefix));
  if (monthWeeks.length === 0) return 0;
  const from = ymdToDate(monthWeeks[0])!;
  const to = ymdToDate(monthWeeks[monthWeeks.length - 1])!;
  const [plan, incomeCommitted] = await Promise.all([
    loadPlanCells(tenantId, from, to),
    loadCommittedIncome(tenantId, rows, monthWeeks, to.toISOString().slice(0, 10)),
  ]);
  const incomeRowIds = new Set(
    rows.filter((r) => r.section === "INGRESOS").map((r) => r.id),
  );
  let total = 0;
  for (const rowId of incomeRowIds) {
    const planRow = plan.get(rowId);
    const committedRow = incomeCommitted.committed.get(rowId);
    for (const w of monthWeeks) {
      const p = planRow?.get(w) ?? 0;
      const c = committedRow?.get(w)?.total ?? 0;
      total += p !== 0 ? p : c;
    }
  }
  return Math.round(total / 1.19);
}

async function resolveVentasNetasPrevMonth(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  todayYmd: string,
  targetY: number,
  targetM: number,
): Promise<number> {
  const prev = prevMonth(targetY, targetM);
  const dteNet = await sumIssuedNetSalesForMonth(tenantId, prev.y, prev.m);
  const prevEnd = monthEndYmd(prev.y, prev.m);
  if (todayYmd > prevEnd) return dteNet;
  const flowNet = await sumIncomeFlowForMonth(tenantId, rows, weeks, prev.y, prev.m);
  return flowNet > 0 ? flowNet : dteNet;
}

async function sumReceivedNetForPeriod(
  tenantId: string,
  periodo: string,
): Promise<number> {
  const [y, mo] = periodo.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "RECEIVED",
      dteType: { in: [33, 46] },
      date: { gte: start, lt: end },
      OR: [{ receptionStatus: null }, { receptionStatus: { notIn: ["CLAIMED", "PARTIAL_CLAIM"] } }],
    },
    select: { netAmount: true },
  });
  return Math.round(dtes.reduce((s, d) => s + Number(d.netAmount), 0));
}

async function avgHistoricalCreditoFiscal(
  tenantId: string,
  beforePeriodo: string,
  sampleMonths = 6,
): Promise<number> {
  const [y, mo] = beforePeriodo.split("-").map(Number);
  const credits: number[] = [];
  let cy = y;
  let cm = mo - 1;
  for (let i = 0; i < sampleMonths; i++) {
    if (cm < 0) {
      cm = 11;
      cy -= 1;
    }
    const p = periodoKey(cy, cm);
    try {
      const r = await computeF29Period(tenantId, p);
      credits.push(r.f29.creditoFiscal);
    } catch {
      // omitir períodos sin datos
    }
    cm -= 1;
  }
  if (credits.length === 0) return 0;
  return Math.round(credits.reduce((a, b) => a + b, 0) / credits.length);
}

async function sumProjectedVentasNetasForPeriod(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  periodo: string,
): Promise<number> {
  const monthWeeks = weeks.filter((w) => w.startsWith(periodo));
  if (monthWeeks.length === 0) return 0;
  const from = ymdToDate(monthWeeks[0])!;
  const to = ymdToDate(monthWeeks[monthWeeks.length - 1])!;
  const [plan, incomeCommitted] = await Promise.all([
    loadPlanCells(tenantId, from, to),
    loadCommittedIncome(tenantId, rows, monthWeeks, to.toISOString().slice(0, 10)),
  ]);
  const incomeRowIds = rows
    .filter((r) => r.section === "INGRESOS")
    .map((r) => r.id);
  let gross = 0;
  for (const rowId of incomeRowIds) {
    const planRow = plan.get(rowId);
    const committedRow = incomeCommitted.committed.get(rowId);
    for (const w of monthWeeks) {
      const p = planRow?.get(w) ?? 0;
      const c = committedRow?.get(w)?.total ?? 0;
      gross += p !== 0 ? p : c;
    }
  }
  return Math.round(gross / 1.19);
}

function fractionElapsedInPeriod(todayYmd: string, y: number, monthZeroIdx: number): number {
  const start = new Date(`${periodoKey(y, monthZeroIdx)}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(y, monthZeroIdx + 1, 1));
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  if (today.getTime() <= start.getTime()) return 0;
  if (today.getTime() >= end.getTime()) return 1;
  const total = end.getTime() - start.getTime();
  const elapsed = today.getTime() - start.getTime();
  return elapsed / total;
}

function findRowId(rows: FlowRowRef[], name: string): string | null {
  const key = normalizeRowName(name);
  return rows.find((r) => normalizeRowName(r.name) === key)?.id ?? null;
}

/**
 * Proyección paramétrica v5: retiro socios, TE forward, finiquitos, F29 futuro
 * y parches de payroll (descuento TE → líquido / Previred).
 */
export async function loadExpenseParametrics(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  todayYmd: string,
  fromYmd: string,
  toYmd: string,
  payroll: {
    liquidoTotal: number;
    previRedTotal: number;
    payDay: number;
    previredDay: number;
    ivaDay: number;
    pendingTeTotal: number;
  },
): Promise<ExpenseParametricsResult> {
  const milestones: ExpenseMilestoneInput[] = [];
  const teWeeklyProjections: TeWeeklyProjectionInput[] = [];
  const payrollPatches: PayrollMilestonePatch[] = [];
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  const currentWeek = weekStartYmd(today);

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: {
      retiroSocioPctVentas: true,
      retiroSocioPayDay: true,
      turnosExtraMode: true,
      turnosExtraPercentage: true,
      turnosExtraLiquidoDiscountPct: true,
      turnosExtraPreviRedDiscountPct: true,
      finiquitosAvgMonths: true,
      finiquitosManualMonthlyClp: true,
      ppmRatePct: true,
    },
  });

  const retiroPct = Number(config?.retiroSocioPctVentas ?? 0);
  const retiroPayDay = config?.retiroSocioPayDay ?? 5;
  const teMode = config?.turnosExtraMode ?? "HISTORICAL";
  const tePct = Number(config?.turnosExtraPercentage ?? 0);
  const liquidoDiscountPct = Number(config?.turnosExtraLiquidoDiscountPct ?? 1);
  const previRedDiscountPct = Number(config?.turnosExtraPreviRedDiscountPct ?? 0);
  const finiquitosAvgMonths = config?.finiquitosAvgMonths ?? 6;
  const finiquitosManual = config?.finiquitosManualMonthlyClp;
  const ppmRatePct = Number(config?.ppmRatePct ?? 0);

  const teRowId = findRowId(rows, "Turnos extra");
  const finRowId = findRowId(rows, "Finiquitos");

  const horizonMonths = monthsBetween(fromYmd, toYmd);
  const fromDate = ymdToDate(fromYmd)!;
  const toDate = ymdToDate(toYmd)!;
  const [plan, tePaidByMonth, finiquitosHistory] = await Promise.all([
    loadPlanCells(tenantId, fromDate, toDate),
    loadTePaidByMonth(tenantId, horizonMonths),
    loadFiniquitosMonthlyHistory(tenantId, rows, finRowId, finiquitosAvgMonths, todayYmd),
  ]);

  const tePlanBlockedWeeks = new Set<string>();
  if (teRowId) {
    const tePlan = plan.get(teRowId);
    if (tePlan) {
      for (const [w, amt] of tePlan) {
        if (amt !== 0) tePlanBlockedWeeks.add(w);
      }
    }
  }

  // ── A. Retiro socios ──
  const retiroRowId = findRowId(rows, "Retiro socios");
  const retiroPlanByWeek = retiroRowId ? plan.get(retiroRowId) : undefined;
  const monthsWithRetiroPlan = new Set<string>();
  if (retiroPlanByWeek) {
    for (const [w, amt] of retiroPlanByWeek) {
      if (amt !== 0) monthsWithRetiroPlan.add(w.slice(0, 7));
    }
  }

  if (retiroPct > 0) {
    for (const { y, m } of horizonMonths) {
      const payYmd = ymdOf(y, m, retiroPayDay);
      const payWeek = payWeekForMonthDay(y, m, retiroPayDay);
      if (payWeek < fromYmd || payWeek > toYmd) continue;
      if (y === today.getUTCFullYear() && m === today.getUTCMonth() && todayYmd > payYmd) {
        continue;
      }
      // Si hay plan manual en el mes, no proyectar el hito (permite "Mover" paramétrico).
      if (monthsWithRetiroPlan.has(periodoKey(y, m))) continue;
      const ventas = await resolveVentasNetasPrevMonth(tenantId, rows, weeks, todayYmd, y, m);
      const monto = computeRetiroSocioClp(retiroPct, ventas);
      if (monto <= 0) continue;
      milestones.push({
        key: "retiro_socio",
        label: `Retiro socios ${periodoKey(y, m)}`,
        dateYmd: payYmd,
        amountClp: monto,
        metaNote: `${(retiroPct * 100).toFixed(1)}% ventas netas ${periodoKey(prevMonth(y, m).y, prevMonth(y, m).m)}`,
      });
    }
  }

  // ── B. TE forward semanal ──
  let teWeeklyAmount = 0;
  if (teMode === "PCT_PAYROLL" && tePct > 0) {
    for (const { y, m } of horizonMonths) {
      const wim = weeksInCalendarMonth(y, m);
      const w = computeTePctPayrollWeekly(tePct, payroll.liquidoTotal, wim);
      if (w > teWeeklyAmount) teWeeklyAmount = w;
    }
  } else {
    const since = new Date(today.getTime() - 8 * 7 * 86_400_000);
    const paidAmounts = await prisma.opsTurnoExtra.findMany({
      where: { tenantId, paidAt: { not: null, gte: since } },
      select: { amountClp: true, paidAt: true },
    });
    const byWeek = new Map<string, number>();
    for (const t of paidAmounts) {
      if (!t.paidAt) continue;
      const w = weekStartYmd(t.paidAt);
      byWeek.set(w, (byWeek.get(w) ?? 0) + Number(t.amountClp ?? 0));
    }
    const amounts = weeks
      .filter((w) => w < currentWeek)
      .map((w) => byWeek.get(w) ?? 0)
      .filter((v) => v > 0);
    teWeeklyAmount = computeTeHistoricalWeekly(amounts.length ? amounts : [...byWeek.values()], 8);
  }

  if (teWeeklyAmount > 0) {
    for (const w of weeks) {
      if (w < currentWeek || tePlanBlockedWeeks.has(w)) continue;
      teWeeklyProjections.push({
        weekYmd: w,
        amountClp: teWeeklyAmount,
        label:
          teMode === "PCT_PAYROLL"
            ? `TE proyectado ${(tePct * 100).toFixed(1)}% líquido`
            : "TE promedio 8 sem",
      });
    }
  }

  const teProjectedByWeek = new Map(teWeeklyProjections.map((t) => [t.weekYmd, t.amountClp]));

  // ── B. Descuento TE → líquido / Previred ──
  for (const { y, m } of horizonMonths) {
    const liquidoDate = ymdOf(y, m, payroll.payDay);
    const previredDate = ymdOf(y, m, payroll.previredDay);
    const monthKey = periodoKey(y, m);
    const paidTe = tePaidByMonth.get(monthKey) ?? 0;
    let projectedTe = 0;
    for (const [w, amt] of teProjectedByWeek) {
      if (w.startsWith(monthKey) && w >= currentWeek) projectedTe += amt;
    }
    if (monthKey === todayYmd.slice(0, 7)) projectedTe += payroll.pendingTeTotal;
    const tePeriodo = paidTe + projectedTe;

    if (payroll.liquidoTotal > 0 && liquidoDiscountPct > 0) {
      const adj = applyTeDiscountToLiquido(payroll.liquidoTotal, tePeriodo, liquidoDiscountPct);
      if (adj.discount > 0) {
        payrollPatches.push({
          key: "liquido",
          dateYmd: liquidoDate,
          amountClp: adj.net,
          label: "Sueldos líquidos",
          metaNote: `base $${adj.base.toLocaleString("es-CL")}, desc. TE $${adj.discount.toLocaleString("es-CL")}`,
        });
      }
    }
    if (payroll.previRedTotal > 0 && previRedDiscountPct > 0) {
      const adj = applyTeDiscountToLiquido(payroll.previRedTotal, tePeriodo, previRedDiscountPct);
      if (adj.discount > 0) {
        payrollPatches.push({
          key: "previred",
          dateYmd: previredDate,
          amountClp: adj.net,
          label: "Previred (imposiciones)",
          metaNote: `base $${adj.base.toLocaleString("es-CL")}, desc. TE $${adj.discount.toLocaleString("es-CL")}`,
        });
      }
    }
  }

  // ── C. Finiquitos ──
  const finiquitosMonthly = computeFiniquitosMonthly(finiquitosManual, finiquitosHistory);
  if (finiquitosMonthly > 0) {
    for (const { y, m } of horizonMonths) {
      const payYmd = ymdOf(y, m, payroll.payDay);
      const payWeek = payWeekForMonthDay(y, m, payroll.payDay);
      if (payWeek < fromYmd || payWeek > toYmd) continue;
      milestones.push({
        key: "finiquitos",
        label: "Finiquitos",
        dateYmd: payYmd,
        amountClp: finiquitosMonthly,
      });
    }
  }

  // ── D. IVA F29 futuro (período en curso y futuros) ──
  const avgCredito = await avgHistoricalCreditoFiscal(
    tenantId,
    periodoKey(today.getUTCFullYear(), today.getUTCMonth()),
  );
  for (const { y, m } of horizonMonths) {
    const periodEnd = new Date(Date.UTC(y, m + 1, 1));
    if (periodEnd.getTime() <= today.getTime()) continue;
    const periodo = periodoKey(y, m);
    const payYmd = ymdOf(m === 11 ? y + 1 : y, (m + 1) % 12, payroll.ivaDay);
    if (payYmd < fromYmd || payYmd > toYmd) continue;

    const [ventasNetas, netoRecibidas] = await Promise.all([
      sumProjectedVentasNetasForPeriod(tenantId, rows, weeks, periodo),
      sumReceivedNetForPeriod(tenantId, periodo),
    ]);
    const ventasBrutas = Math.round(ventasNetas * 1.19);
    const ppmClp = Math.round(ventasBrutas * (ppmRatePct / 100));
    const f29 = computeF29FutureClp({
      ventasNetasProyectadas: ventasNetas,
      netoFacturasRecibidas: netoRecibidas,
      avgCreditoHistorico: avgCredito,
      fractionElapsed: fractionElapsedInPeriod(todayYmd, y, m),
      ppmClp,
    });
    if (f29.total <= 0 && !f29.clamped) continue;
    milestones.push({
      key: "f29",
      label: `IVA F29 ${periodo} (proy.)`,
      dateYmd: payYmd,
      amountClp: f29.total,
      metaNote: f29.clamped ? "IVA a favor — pago clamp 0" : undefined,
    });
  }

  return {
    milestones,
    teWeeklyProjections,
    tePlanBlockedWeeks,
    teRowId,
    payrollPatches,
  };
}

async function loadTePaidByMonth(
  tenantId: string,
  months: Array<{ y: number; m: number }>,
): Promise<Map<string, number>> {
  if (months.length === 0) return new Map();
  const first = months[0];
  const last = months[months.length - 1];
  const from = new Date(Date.UTC(first.y, first.m, 1));
  const to = new Date(Date.UTC(last.y, last.m + 1, 1));
  const paid = await prisma.opsTurnoExtra.findMany({
    where: { tenantId, paidAt: { not: null, gte: from, lt: to } },
    select: { amountClp: true, paidAt: true },
  });
  const byMonth = new Map<string, number>();
  for (const t of paid) {
    if (!t.paidAt) continue;
    const key = t.paidAt.toISOString().slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(t.amountClp ?? 0));
  }
  return byMonth;
}

async function loadFiniquitosMonthlyHistory(
  tenantId: string,
  rows: FlowRowRef[],
  finRowId: string | null,
  avgMonths: number,
  todayYmd: string,
): Promise<number[]> {
  if (!finRowId) return [];
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - avgMonths, 1));
  const histWeeks = enumerateWeeks(from, today);
  if (histWeeks.length === 0) return [];
  const real = await loadReal(tenantId, rows, histWeeks);
  const byMonth = new Map<string, number>();
  const rowReal = real.get(finRowId);
  if (!rowReal) return [];
  for (const [w, cell] of rowReal) {
    const mk = w.slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + Math.abs(cell.total));
  }
  return [...byMonth.values()].filter((v) => v > 0);
}
