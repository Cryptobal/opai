/**
 * Métricas agregadas por empresa de factoring (Fase 3).
 *
 * Para cada empresa devuelve: cantidad de operaciones, volumen cedido
 * (suma de invoice amounts), tasa efectiva mensual promedio (ponderada
 * por advance amount), y costo financiero total. Solo incluye
 * operaciones con `effectiveMonthlyRate` calculado (es decir, donde el
 * usuario subió la simulación PDF) — para empresas sin simulaciones la
 * tasa efectiva queda null y el ranking las baja al final.
 */

import { prisma } from "@/lib/prisma";
import { FinanceFactoringStatus } from "@prisma/client";

export interface FactoringCompanyMetrics {
  factoringCompanyId: string;
  operationsCount: number;
  /** Suma de invoice_amount de todas las operaciones cedidas. */
  totalVolume: number;
  /** Suma de costo_financiero (sólo ops con simulación). */
  totalCostoFinanciero: number;
  /** Tasa efectiva mensual promedio (ponderada por advance_amount). null si
   *  ninguna operación tiene `effective_monthly_rate`. */
  avgEffectiveMonthlyRate: number | null;
  /** Fecha de la última cesión registrada. */
  lastCessionAt: Date | null;
}

const EXCLUDED_STATUSES: FinanceFactoringStatus[] = [
  FinanceFactoringStatus.CANCELLED,
];

export async function getFactoringMetricsByCompany(
  tenantId: string,
): Promise<Map<string, FactoringCompanyMetrics>> {
  // 1) Counts + totals por empresa (todas las operaciones no canceladas).
  const totals = await prisma.financeFactoringOperation.groupBy({
    by: ["factoringCompanyId"],
    where: {
      tenantId,
      factoringCompanyId: { not: null },
      status: { notIn: EXCLUDED_STATUSES },
    },
    _count: { _all: true },
    _sum: { invoiceAmount: true, costoFinanciero: true },
    _max: { fechaCesion: true },
  });

  // 2) Tasa efectiva promedio ponderada por advance_amount. Sólo
  //    considera operaciones con effective_monthly_rate (es decir, las
  //    que tienen simulación + monto a girar real).
  //    Hacemos un raw query para el promedio ponderado porque Prisma
  //    no expone `SUM(rate * weight) / SUM(weight)` directamente.
  const weighted = await prisma.$queryRaw<
    Array<{ factoring_company_id: string; weighted_rate: string | null }>
  >`
    SELECT
      factoring_company_id,
      CASE WHEN SUM(advance_amount) > 0
        THEN SUM(effective_monthly_rate * advance_amount) / SUM(advance_amount)
        ELSE NULL
      END AS weighted_rate
    FROM finance.finance_factoring_operations
    WHERE tenant_id = ${tenantId}
      AND effective_monthly_rate IS NOT NULL
      AND status NOT IN ('CANCELLED')
      AND factoring_company_id IS NOT NULL
    GROUP BY factoring_company_id
  `;
  const rateByCompany = new Map<string, number | null>(
    weighted.map((r) => [
      r.factoring_company_id,
      r.weighted_rate != null ? Number(r.weighted_rate) : null,
    ]),
  );

  const result = new Map<string, FactoringCompanyMetrics>();
  for (const row of totals) {
    if (!row.factoringCompanyId) continue;
    const count = row._count?._all ?? 0;
    const invoiceSum = row._sum?.invoiceAmount;
    const costoSum = row._sum?.costoFinanciero;
    const lastCession = row._max?.fechaCesion ?? null;
    result.set(row.factoringCompanyId, {
      factoringCompanyId: row.factoringCompanyId,
      operationsCount: count,
      totalVolume: invoiceSum ? Number(invoiceSum) : 0,
      totalCostoFinanciero: costoSum ? Number(costoSum) : 0,
      avgEffectiveMonthlyRate: rateByCompany.get(row.factoringCompanyId) ?? null,
      lastCessionAt: lastCession,
    });
  }
  return result;
}
