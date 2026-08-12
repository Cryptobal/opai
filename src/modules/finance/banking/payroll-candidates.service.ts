import "server-only";
import { prisma } from "@/lib/prisma";
import type { PayrollCandidateHit } from "./flow-classify.service";

/** Alias del contrato puro en flow-classify (sin desglose de liquidación). */
export type PayrollCandidate = PayrollCandidateHit;

const MONTH_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function periodLabel(year: number, month: number): string {
  const m = MONTH_SHORT_ES[Math.max(0, Math.min(11, month - 1))] ?? "???";
  const yy = String(year).slice(-2);
  return `${m}-${yy}`;
}

function finiquitoLabel(d: Date): string {
  const ymd = d.toISOString().slice(0, 10);
  const [y, m, day] = ymd.split("-");
  return `Finiquito ${day}/${m}/${y?.slice(2) ?? ""}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Candidatos de nómina / finiquito para un set de guardias.
 * Tres queries batch; sin N+1. No expone desglose de liquidación.
 */
export async function loadPayrollCandidates(
  tenantId: string,
  guardiaIds: string[],
  windowDays: number,
): Promise<Map<string, PayrollCandidate[]>> {
  const result = new Map<string, PayrollCandidate[]>();
  if (guardiaIds.length === 0) return result;

  const uniqueIds = [...new Set(guardiaIds)];
  for (const id of uniqueIds) result.set(id, []);

  const now = new Date();
  const windowStart = addDays(now, -Math.max(0, windowDays));
  // Ventana de período: desde el mes de windowStart (inclusive).
  const minYear = windowStart.getUTCFullYear();
  const minMonth = windowStart.getUTCMonth() + 1;

  const finiquitoFrom = addDays(now, -Math.max(0, windowDays));
  const finiquitoTo = addDays(now, 90);
  // Truncar a date-only UTC para @db.Date
  const finFromYmd = new Date(finiquitoFrom.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const finToYmd = new Date(finiquitoTo.toISOString().slice(0, 10) + "T00:00:00.000Z");

  const [liquidaciones, anticipos, finiquitos] = await Promise.all([
    prisma.payrollLiquidacion.findMany({
      where: {
        tenantId,
        guardiaId: { in: uniqueIds },
        status: "APPROVED",
        paidAt: null,
        OR: [
          { period: { year: { gt: minYear } } },
          { period: { year: minYear, month: { gte: minMonth } } },
        ],
      },
      select: {
        id: true,
        guardiaId: true,
        netSalary: true,
        period: { select: { year: true, month: true } },
      },
      orderBy: [{ period: { year: "asc" } }, { period: { month: "asc" } }],
    }),
    prisma.payrollAnticipoItem.findMany({
      where: {
        guardiaId: { in: uniqueIds },
        status: "PENDING",
        anticipoProcess: { tenantId },
      },
      select: {
        id: true,
        guardiaId: true,
        amount: true,
        anticipoProcess: {
          select: {
            period: { select: { year: true, month: true } },
          },
        },
      },
    }),
    prisma.opsGuardEvent.findMany({
      where: {
        tenantId,
        guardiaId: { in: uniqueIds },
        category: "finiquito",
        status: "approved",
        finiquitoDate: { gte: finFromYmd, lte: finToYmd },
      },
      select: {
        id: true,
        guardiaId: true,
        finiquitoDate: true,
        totalSettlementAmount: true,
      },
    }),
  ]);

  for (const liq of liquidaciones) {
    const list = result.get(liq.guardiaId) ?? [];
    list.push({
      kind: "LIQUIDACION",
      guardiaId: liq.guardiaId,
      amount: Math.round(Number(liq.netSalary)),
      label: `Liquidación ${periodLabel(liq.period.year, liq.period.month)}`,
      refId: liq.id,
    });
    result.set(liq.guardiaId, list);
  }

  for (const ant of anticipos) {
    const period = ant.anticipoProcess.period;
    const list = result.get(ant.guardiaId) ?? [];
    list.push({
      kind: "ANTICIPO",
      guardiaId: ant.guardiaId,
      amount: Math.round(Number(ant.amount)),
      label: `Anticipo ${periodLabel(period.year, period.month)}`,
      refId: ant.id,
    });
    result.set(ant.guardiaId, list);
  }

  for (const fin of finiquitos) {
    if (fin.totalSettlementAmount == null || !fin.finiquitoDate) continue;
    const list = result.get(fin.guardiaId) ?? [];
    list.push({
      kind: "FINIQUITO",
      guardiaId: fin.guardiaId,
      amount: Math.round(Number(fin.totalSettlementAmount)),
      label: finiquitoLabel(fin.finiquitoDate),
      refId: fin.id,
    });
    result.set(fin.guardiaId, list);
  }

  return result;
}
