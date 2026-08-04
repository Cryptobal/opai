/**
 * Parámetros puros para proyección paramétrica v5 (TE, retiro, finiquitos, F29, drift).
 * Enteros CLP vía Math.round donde aplique. Sin imports server-only.
 */
import { weekStartYmd, ymdToDate } from "./weeks";

/** Retiro socios / regla %: pct (fracción) × ventasNetasMesAnterior; 0 si pct<=0. */
export function computeRetiroSocioClp(pct: number, ventasNetasPrevMonth: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (!Number.isFinite(ventasNetasPrevMonth)) return 0;
  return Math.round(pct * ventasNetasPrevMonth);
}

/** Alias semántico v5.1 para recurrencias PCT_SALES. */
export function computePctSalesClp(pctSalesFraction: number, ventasNetasPrevMonth: number): number {
  return computeRetiroSocioClp(pctSalesFraction, ventasNetasPrevMonth);
}

/**
 * Precedencia retiro: regla PCT_SALES de la fila pisa el knob global.
 */
export function resolveRetiroPctFraction(args: {
  rowHasPctSalesRule: boolean;
  rulePctFraction: number | null | undefined;
  globalPctFraction: number;
}): number {
  if (args.rowHasPctSalesRule) {
    const p = Number(args.rulePctFraction ?? 0);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }
  const g = Number(args.globalPctFraction ?? 0);
  return Number.isFinite(g) && g > 0 ? g : 0;
}

/** Semana ISO (lunes YMD) que contiene el día de pago del mes. */
export function payWeekForMonthDay(year: number, monthZeroIdx: number, day: number): string {
  const last = new Date(Date.UTC(year, monthZeroIdx + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(day, 1), last);
  const payDate = new Date(Date.UTC(year, monthZeroIdx, clampedDay));
  return weekStartYmd(payDate);
}

/** TE forward HISTORICAL: promedio de montos semanales reales de las últimas N semanas (default 8). */
export function computeTeHistoricalWeekly(
  realWeeklyAmounts: number[],
  windowWeeks = 8,
): number {
  if (!Array.isArray(realWeeklyAmounts) || realWeeklyAmounts.length === 0) return 0;
  const n = Math.max(1, Math.floor(windowWeeks));
  const slice = realWeeklyAmounts.slice(-n);
  const sum = slice.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  return Math.round(sum / slice.length);
}

/** TE forward PCT_PAYROLL: round(pct × liquidoMensual / semanasDelMes). */
export function computeTePctPayrollWeekly(
  pct: number,
  liquidoMensual: number,
  weeksInMonth: number,
): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (!Number.isFinite(liquidoMensual) || liquidoMensual <= 0) return 0;
  if (!Number.isFinite(weeksInMonth) || weeksInMonth <= 0) return 0;
  return Math.round((pct * liquidoMensual) / weeksInMonth);
}

/** Descuento TE→líquido: max(0, liquidoBase - round(tePeriodo × discountPct)). */
export function applyTeDiscountToLiquido(
  liquidoBase: number,
  tePeriodoClp: number,
  discountPct: number,
): { net: number; discount: number; base: number } {
  const base = Number.isFinite(liquidoBase) ? liquidoBase : 0;
  const te = Number.isFinite(tePeriodoClp) ? tePeriodoClp : 0;
  const pct = Number.isFinite(discountPct) ? discountPct : 0;
  const discount = Math.round(te * pct);
  const net = Math.max(0, base - discount);
  return { net, discount, base };
}

/** Finiquitos: manual si seteado; si no promedio de reales (0 si vacío). */
export function computeFiniquitosMonthly(
  manualClp: number | null | undefined,
  realHistory: number[],
): number {
  if (manualClp != null && Number.isFinite(manualClp)) {
    return Math.round(manualClp);
  }
  if (!Array.isArray(realHistory) || realHistory.length === 0) return 0;
  const sum = realHistory.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  return Math.round(sum / realHistory.length);
}

/**
 * IVA F29 futuro:
 * debito = round(0.19 * ventasNetasProyectadas)
 * credito = round(0.19 * netoFacturasRecibidas) + round(fraccionRestante * avgCreditoHistorico)
 * total = max(0, debito - credito + ppm)
 * Devuelve { total, debito, credito, ppm, clamped }
 */
export function computeF29FutureClp(args: {
  ventasNetasProyectadas: number;
  netoFacturasRecibidas: number;
  avgCreditoHistorico: number;
  fractionElapsed: number; // 0..1 del período
  ppmClp: number;
}): { total: number; debito: number; credito: number; ppm: number; clamped: boolean } {
  const ventas = Number.isFinite(args.ventasNetasProyectadas) ? args.ventasNetasProyectadas : 0;
  const neto = Number.isFinite(args.netoFacturasRecibidas) ? args.netoFacturasRecibidas : 0;
  const avgCredito = Number.isFinite(args.avgCreditoHistorico) ? args.avgCreditoHistorico : 0;
  const elapsed = Number.isFinite(args.fractionElapsed)
    ? Math.min(1, Math.max(0, args.fractionElapsed))
    : 0;
  const ppm = Number.isFinite(args.ppmClp) ? Math.round(args.ppmClp) : 0;

  const debito = Math.round(0.19 * ventas);
  const fraccionRestante = 1 - elapsed;
  const credito =
    Math.round(0.19 * neto) + Math.round(fraccionRestante * avgCredito);
  const raw = debito - credito + ppm;
  const total = Math.max(0, raw);
  return { total, debito, credito, ppm, clamped: raw < 0 };
}

/** Desviación: projected (plan≠0 ? plan : committed), real, delta=real-projected, pct. */
export function computeCellDrift(
  plan: number,
  committed: number,
  real: number | null,
): {
  projected: number;
  real: number | null;
  delta: number | null;
  pct: number | null;
} | null {
  if (real == null || !Number.isFinite(real)) return null;
  const projected = plan !== 0 ? plan : committed;
  const delta = real - projected;
  const pct = projected !== 0 ? (delta / projected) * 100 : null;
  return { projected, real, delta, pct };
}
