/**
 * Helper puro de postergación de IVA (SII art. 64 DL 825, 2 meses).
 * Sin Prisma ni server-only: lo consumen loaders, servicio y tests.
 */
import type { ExpenseMilestoneInput } from "./derive-committed-expense";

/** Meses de postergación del giro de IVA (tope SII). */
export const POSTPONE_MONTHS = 2;

/** Períodos tributarios extra hacia atrás para no perder el hito postergado. */
export const F29_LOOKBACK_MONTHS = POSTPONE_MONTHS + 1;

export interface IvaPostponementRef {
  taxPeriod: string;
  postponedPayYmd: string;
}

function ymdOf(y: number, monthZeroIdx: number, day: number): string {
  const last = new Date(Date.UTC(y, monthZeroIdx + 1, 0)).getUTCDate();
  const d = day === -1 ? last : Math.min(Math.max(day, 1), last);
  return new Date(Date.UTC(y, monthZeroIdx, d)).toISOString().slice(0, 10);
}

function shiftCalendarMonths(
  y: number,
  monthZeroIdx: number,
  delta: number,
): { y: number; m: number } {
  const abs = monthZeroIdx + delta;
  const ny = y + Math.floor(abs / 12);
  const nm = ((abs % 12) + 12) % 12;
  return { y: ny, m: nm };
}

/** Fecha de pago natural del F29: día `ivaPayDay` del mes siguiente a `taxPeriod`. */
export function computeOriginalPayYmd(taxPeriod: string, ivaPayDay: number): string {
  const [y, mo] = taxPeriod.split("-").map(Number);
  if (!y || !mo) throw new Error(`Período inválido (YYYY-MM): ${taxPeriod}`);
  const monthZero = mo - 1;
  const next = shiftCalendarMonths(y, monthZero, 1);
  return ymdOf(next.y, next.m, ivaPayDay);
}

/**
 * Suma 2 meses a la fecha de pago original y fija el día `payDay`,
 * clampeado al último día del mes destino.
 */
export function computePostponedPayYmd(originalPayYmd: string, payDay: number): string {
  const [y, mo] = originalPayYmd.split("-").map(Number);
  if (!y || !mo) throw new Error(`Fecha inválida (YYYY-MM-DD): ${originalPayYmd}`);
  const dest = shiftCalendarMonths(y, mo - 1, POSTPONE_MONTHS);
  return ymdOf(dest.y, dest.m, payDay);
}

/** Retrocede N meses calendario conservando el día (clamp). */
export function lookbackFromYmd(fromYmd: string, months: number): string {
  const [y, mo, day] = fromYmd.split("-").map(Number);
  if (!y || !mo || !day) throw new Error(`Fecha inválida (YYYY-MM-DD): ${fromYmd}`);
  const dest = shiftCalendarMonths(y, mo - 1, -months);
  return ymdOf(dest.y, dest.m, day);
}

export function formatDdMmYyyy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Parte el hito F29 cuando hay postergación: resto (PPM/retenciones) en la
 * fecha original + IVA determinado 2 meses después. Sin postergación devuelve
 * el hito `f29` intacto (mismos montos y label que hoy).
 *
 * Invariante: suma de montos emitidos === max(0, round(totalAPagarClp))
 * cuando ivaDeterminado > 0; si ivaDeterminado ≤ 0 el hito único lleva
 * totalAPagar (PPM) y no se emite iva_postergado.
 */
export function splitF29Milestone(args: {
  taxPeriod: string;
  payYmd: string;
  totalAPagarClp: number;
  ivaDeterminadoClp: number;
  postponement: IvaPostponementRef | null;
  labelSuffix?: string;
  metaNote?: string;
}): ExpenseMilestoneInput[] {
  const totalClp = Math.max(0, Math.round(args.totalAPagarClp));
  const baseLabel = args.labelSuffix
    ? `IVA F29 ${args.taxPeriod} ${args.labelSuffix}`
    : `IVA F29 ${args.taxPeriod}`;

  if (!args.postponement) {
    return [
      {
        key: "f29",
        label: baseLabel,
        dateYmd: args.payYmd,
        amountClp: totalClp,
        taxPeriod: args.taxPeriod,
        metaNote: args.metaNote,
      },
    ];
  }

  const ivaClp = Math.max(0, Math.round(args.ivaDeterminadoClp));
  const restoClp = Math.max(0, totalClp - ivaClp);
  const dueLabel = formatDdMmYyyy(args.postponement.postponedPayYmd);
  const out: ExpenseMilestoneInput[] = [];

  if (restoClp > 0) {
    out.push({
      key: "f29",
      label: `${baseLabel} (solo PPM · IVA postergado)`,
      dateYmd: args.payYmd,
      amountClp: restoClp,
      taxPeriod: args.taxPeriod,
      metaNote: args.metaNote
        ? `${args.metaNote} · IVA postergado a ${dueLabel}`
        : `IVA postergado a ${dueLabel}`,
    });
  }

  if (ivaClp > 0) {
    out.push({
      key: "iva_postergado",
      label: `IVA postergado ${args.taxPeriod} (vence ${dueLabel})`,
      dateYmd: args.postponement.postponedPayYmd,
      amountClp: ivaClp,
      taxPeriod: args.taxPeriod,
      metaNote: `IVA del período ${args.taxPeriod}`,
    });
  }

  return out;
}
