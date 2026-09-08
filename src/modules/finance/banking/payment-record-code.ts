import type { Prisma } from "@prisma/client";

/**
 * Series de código de FinancePaymentRecord.
 *
 * COB-/PAG- son cobros/pagos manuales (conciliación o módulo de pagos).
 * COB-AUTO-/PAG-AUTO- son auto-match. Cada serie tiene su propio
 * correlativo: no se mezclan.
 */
export type PaymentRecordCodeSeries =
  | "COLLECTION"
  | "DISBURSEMENT"
  | "COLLECTION_AUTO"
  | "DISBURSEMENT_AUTO";

const SERIES: Record<
  PaymentRecordCodeSeries,
  { prefix: string; re: RegExp; excludeAuto: boolean }
> = {
  COLLECTION: { prefix: "COB", re: /^COB-(\d{6})$/, excludeAuto: true },
  DISBURSEMENT: { prefix: "PAG", re: /^PAG-(\d{6})$/, excludeAuto: true },
  COLLECTION_AUTO: {
    prefix: "COB-AUTO",
    re: /^COB-AUTO-(\d{6})$/,
    excludeAuto: false,
  },
  DISBURSEMENT_AUTO: {
    prefix: "PAG-AUTO",
    re: /^PAG-AUTO-(\d{6})$/,
    excludeAuto: false,
  },
};

type PaymentRecordCodeClient = {
  financePaymentRecord: {
    findFirst: Prisma.TransactionClient["financePaymentRecord"]["findFirst"];
  };
};

/**
 * Siguiente código de la serie, basado en el MAX del correlativo — no en
 * `count(*)`.
 *
 * `count` choca con `@@unique(tenantId, code)` cuando hay huecos: registros
 * borrados al desconciliar, series PAG/COB/AUTO que inflan el total, o un
 * lote N→N que rellena huecos y pisa un código que sigue vivo (p.ej.
 * count=206 → COB-000207… y el 4º create pisa COB-000210).
 */
export async function nextPaymentRecordCode(
  txClient: PaymentRecordCodeClient,
  tenantId: string,
  series: PaymentRecordCodeSeries
): Promise<string> {
  const spec = SERIES[series];
  const last = await txClient.financePaymentRecord.findFirst({
    where: {
      tenantId,
      code: { startsWith: `${spec.prefix}-` },
      ...(spec.excludeAuto
        ? { NOT: { code: { startsWith: `${spec.prefix}-AUTO-` } } }
        : {}),
    },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const match = last?.code ? spec.re.exec(last.code) : null;
  const next = (match ? Number(match[1]) : 0) + 1;
  return `${spec.prefix}-${String(next).padStart(6, "0")}`;
}

export function paymentRecordSeriesForIncome(
  isIncome: boolean,
  auto = false
): PaymentRecordCodeSeries {
  if (auto) return isIncome ? "COLLECTION_AUTO" : "DISBURSEMENT_AUTO";
  return isIncome ? "COLLECTION" : "DISBURSEMENT";
}
