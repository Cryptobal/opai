import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";

/**
 * Proyección mínima (2 buckets, 2 categorías) para tests del list view
 * móvil. Los buckets vienen con `start`/`end` como string para simular
 * el formato post-JSON.stringify del Server Component.
 */
export function makeMobileProjection(): ProjectionMatrix {
  const buckets = [
    {
      key: "2026-W19",
      label: "Sem 19",
      start: "2026-05-04",
      end: "2026-05-10",
      income: 1_000_000,
      expense: 400_000,
      net: 600_000,
      actualIncome: 0,
      actualExpense: 0,
      varianceClp: 0,
      actualBankIncome: 0,
      actualBankExpense: 0,
      actualBankNet: 0,
      bankVarianceClp: 0,
      occurrences: [],
    },
    {
      key: "2026-W20",
      label: "Sem 20",
      start: "2026-05-11",
      end: "2026-05-17",
      income: 1_500_000,
      expense: 500_000,
      net: 1_000_000,
      actualIncome: 0,
      actualExpense: 0,
      varianceClp: 0,
      actualBankIncome: 0,
      actualBankExpense: 0,
      actualBankNet: 0,
      bankVarianceClp: 0,
      occurrences: [],
    },
  ];
  return {
    range: {
      from: new Date("2026-05-04"),
      to: new Date("2026-05-17"),
      granularity: "weekly",
    },
    buckets: buckets as unknown as ProjectionMatrix["buckets"],
    rows: [
      {
        categoryId: "cat-ventas",
        categoryCode: "ING_VENTAS",
        categoryName: "Ventas",
        kind: "INCOME",
        values: [
          { bucketKey: "2026-W19", amount: 1_000_000 },
          { bucketKey: "2026-W20", amount: 1_500_000 },
        ],
        total: 2_500_000,
        items: [
          {
            itemId: "item-contrato-1",
            itemName: "Contrato Edificio A",
            installationId: "inst-1",
            installationName: "Edificio A",
            crmAccountId: "acc-1",
            crmAccountName: "Cliente Uno",
            baseAmount: 1_000_000,
            currency: "CLP",
            source: "CONTRACT",
            sourceRefCode: null,
            hasIpcAdjustment: false,
            ipcAdjustmentMonths: null,
            headcount: 0,
            nickname: null,
            modoCobro: "DIRECTO",
            values: [
              { bucketKey: "2026-W19", amount: 1_000_000, actualAmount: null, occurrenceId: "occ-1", scheduledDate: "2026-05-05" },
              { bucketKey: "2026-W20", amount: 1_500_000, actualAmount: null, occurrenceId: "occ-2", scheduledDate: "2026-05-12" },
            ],
            total: 2_500_000,
            totalActual: 0,
          },
        ],
      },
      {
        categoryId: "cat-sueldos",
        categoryCode: "EGR_SUELDOS",
        categoryName: "Sueldos",
        kind: "EXPENSE",
        values: [
          { bucketKey: "2026-W19", amount: 400_000 },
          { bucketKey: "2026-W20", amount: 500_000 },
        ],
        total: 900_000,
        items: [
          {
            itemId: "item-sueldo-1",
            itemName: "Sueldo Operador",
            installationId: null,
            installationName: null,
            crmAccountId: null,
            crmAccountName: null,
            baseAmount: 400_000,
            currency: "CLP",
            source: "PAYROLL",
            sourceRefCode: null,
            hasIpcAdjustment: false,
            ipcAdjustmentMonths: null,
            headcount: 0,
            nickname: null,
            modoCobro: "DIRECTO",
            values: [
              { bucketKey: "2026-W19", amount: 400_000, actualAmount: null, occurrenceId: null, scheduledDate: "2026-05-05" },
              { bucketKey: "2026-W20", amount: 500_000, actualAmount: null, occurrenceId: null, scheduledDate: "2026-05-12" },
            ],
            total: 900_000,
            totalActual: 0,
          },
        ],
      },
    ],
    totals: {
      totalIncome: 2_500_000,
      totalExpense: 900_000,
      totalNet: 1_600_000,
      totalActualIncome: 0,
      totalActualExpense: 0,
      totalVariance: 0,
      currentDriftClp: null,
    },
    openingBalanceClp: 5_000_000,
    openingBreakdown: {
      accounts: [],
      pendingDebitsClp: 0,
      pendingCreditsClp: 0,
      totalClp: 5_000_000,
    } as unknown as ProjectionMatrix["openingBreakdown"],
    cumulativeBalances: [
      { bucketKey: "2026-W19", balanceClp: 5_600_000 },
      { bucketKey: "2026-W20", balanceClp: 6_600_000 },
    ],
    cumulativePoints: [
      { bucketKey: "2026-W19", projectedClp: 5_600_000, realBankClp: null, cumulativeBankVarianceClp: null },
      { bucketKey: "2026-W20", projectedClp: 6_600_000, realBankClp: null, cumulativeBankVarianceClp: null },
    ],
  };
}
