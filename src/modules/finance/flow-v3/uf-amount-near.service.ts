import "server-only";
import { prisma } from "@/lib/prisma";
import { getUfValueForDate } from "@/lib/uf";
import { toYmd, ymdToDate } from "./weeks";
import { ufTargetDate, ufToClp } from "./uf-occurrence";
import { expandOccurrenceDates } from "./recurring-plan.service";
import { isAmountNearUfExpected, pickNearestUfExpected } from "./uf-amount-near";

function horizonEndYmd(endDate: string | null | undefined, from: Date): string {
  const plus12m = toYmd(
    new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 12, from.getUTCDate())),
  );
  if (endDate && endDate < plus12m) return endDate;
  return plus12m;
}

/**
 * Si la fila tiene recurrencia UF, ¿el monto del banco está cerca del CLP
 * esperado de la ocurrencia más cercana a la fecha del movimiento?
 * `null` = la fila no tiene UF (no aplica el filtro de similitud).
 * No bloquea la clasificación RUT/glosa: solo informa similitud de monto.
 */
export async function evaluateFlowRowUfAmountNear(args: {
  tenantId: string;
  flowRowId: string;
  bankAmountClp: number;
  txDate?: Date | null;
}): Promise<boolean | null> {
  const rules = await prisma.financeFlowPlanRecurrence.findMany({
    where: {
      tenantId: args.tenantId,
      rowId: args.flowRowId,
      currency: "UF",
      amountUf: { not: null },
    },
    select: {
      amountUf: true,
      frequency: true,
      startDate: true,
      endDate: true,
      dayOfMonth: true,
      endAfterOccurrences: true,
      ufPolicy: true,
      ufCustomDay: true,
    },
  });
  if (rules.length === 0) return null;

  const txDate = args.txDate ?? new Date();
  const txYmd = toYmd(txDate);
  const [config, fallbackUf] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId: args.tenantId },
      select: { matchAmountToleranceClp: true },
    }),
    getUfValueForDate(txDate),
  ]);
  const tol = config?.matchAmountToleranceClp ?? 5_000;

  for (const r of rules) {
    const amountUf = Number(r.amountUf);
    if (!(amountUf > 0)) continue;
    const startYmd = r.startDate ? toYmd(r.startDate) : txYmd;
    const endYmd = horizonEndYmd(r.endDate ? toYmd(r.endDate) : null, txDate);
    const dates = expandOccurrenceDates(
      r.frequency,
      startYmd,
      endYmd,
      r.dayOfMonth,
      r.endAfterOccurrences,
    );
    const nearest = pickNearestUfExpected(
      txYmd,
      dates.map((occurrenceYmd) => ({ occurrenceYmd, expectedClp: 0 })),
    );
    const occDate = nearest ? ymdToDate(nearest.occurrenceYmd) ?? txDate : txDate;
    const target = ufTargetDate(r.ufPolicy, r.ufCustomDay, occDate);
    const ufValue = dates.length > 0 ? await getUfValueForDate(target) : fallbackUf;
    if (isAmountNearUfExpected(args.bankAmountClp, ufToClp(amountUf, ufValue), tol)) {
      return true;
    }
  }
  return false;
}

export function txDateFromYmd(ymd: string | null | undefined): Date {
  return ymdToDate(ymd ?? toYmd(new Date())) ?? new Date();
}
