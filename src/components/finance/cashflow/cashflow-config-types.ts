/** Tipos compartidos entre CashflowConfigClient y CashflowConfigParamsPanel. */

export interface CashflowConfig {
  horizonWeeksDefault: number;
  horizonMonthsDefault: number;
  weekStartsOn: number;
  autoSales: boolean;
  autoPayroll: boolean;
  autoTurnosExtra: boolean;
  autoIva: boolean;
  autoRecurringDte: boolean;
  payrollPayDay: number;
  previRedPayDay: number;
  ivaPayDay: number;
  ppmRatePct: number;
  matchAmountToleranceClp: number;
  matchDaysTolerance: number;
  ufMonthlyGrowthPct?: number;
  turnosExtraMode: "HISTORICAL" | "PCT_PAYROLL";
  turnosExtraPercentage: number;
  turnosExtraLiquidoDiscountPct: number;
  turnosExtraPreviRedDiscountPct: number;
  retiroSocioPctVentas: number;
  retiroSocioPayDay: number;
  quincenaMode: "FICHA" | "PCT_LIQUIDO";
  quincenaPctLiquido: number;
  quincenaPayDay: number;
  writeOffAutoEnabled: boolean;
  writeOffMaxAmountClp: number;
  writeOffMaxPercent: number;
  writeOffShortPaymentAccountId: string | null;
  writeOffOverPaymentAccountId: string | null;
  collectionLagDays: number;
  flowWarnThresholdClp: number;
  flowCutoffYmd: string | null;
  projectReceivedDtesAsExpense: boolean;
  finiquitosAvgMonths: number;
  finiquitosManualMonthlyClp: number | null;
  f29CreditAvgMonths: number;
  payrollAfpName: string | null;
  payrollMutualRatePct: number | null;
}

export type RawCashflowConfig = Omit<
  CashflowConfig,
  | "ufMonthlyGrowthPct"
  | "turnosExtraPercentage"
  | "turnosExtraLiquidoDiscountPct"
  | "turnosExtraPreviRedDiscountPct"
  | "retiroSocioPctVentas"
  | "quincenaPctLiquido"
  | "writeOffMaxPercent"
  | "ppmRatePct"
  | "payrollMutualRatePct"
  | "flowCutoffYmd"
  | "projectReceivedDtesAsExpense"
  | "finiquitosAvgMonths"
  | "finiquitosManualMonthlyClp"
  | "f29CreditAvgMonths"
> & {
  ufMonthlyGrowthPct?: number | string;
  ppmRatePct?: number | string;
  payrollMutualRatePct?: number | string | null;
  turnosExtraPercentage: number | string;
  turnosExtraLiquidoDiscountPct: number | string;
  turnosExtraPreviRedDiscountPct: number | string;
  retiroSocioPctVentas: number | string;
  quincenaPctLiquido: number | string;
  writeOffMaxPercent: number | string;
  flowCutoffYmd?: string | Date | null;
  projectReceivedDtesAsExpense?: boolean;
  finiquitosAvgMonths?: number;
  finiquitosManualMonthlyClp?: number | null;
  f29CreditAvgMonths?: number;
  payrollAfpName?: string | null;
};

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  /** FinanceAccountType — para filtrar sugerencias por sección. */
  type?: string;
};

export function coerceCashflowConfig(initial: RawCashflowConfig): CashflowConfig {
  return {
    ...initial,
    ufMonthlyGrowthPct: Number(initial.ufMonthlyGrowthPct ?? 0),
    ppmRatePct: Number(initial.ppmRatePct ?? 0),
    turnosExtraPercentage: Number(initial.turnosExtraPercentage ?? 0),
    turnosExtraLiquidoDiscountPct: Number(initial.turnosExtraLiquidoDiscountPct),
    turnosExtraPreviRedDiscountPct: Number(initial.turnosExtraPreviRedDiscountPct),
    retiroSocioPctVentas: Number(initial.retiroSocioPctVentas ?? 0),
    quincenaPctLiquido: Number(initial.quincenaPctLiquido ?? 0.1),
    writeOffMaxPercent: Number(initial.writeOffMaxPercent ?? 0.005),
    flowCutoffYmd: initial.flowCutoffYmd
      ? String(initial.flowCutoffYmd).slice(0, 10)
      : null,
    projectReceivedDtesAsExpense: initial.projectReceivedDtesAsExpense === true,
    finiquitosAvgMonths: Number(initial.finiquitosAvgMonths ?? 6),
    finiquitosManualMonthlyClp:
      initial.finiquitosManualMonthlyClp == null
        ? null
        : Number(initial.finiquitosManualMonthlyClp),
    f29CreditAvgMonths: Number(initial.f29CreditAvgMonths ?? 6),
    payrollAfpName: initial.payrollAfpName ?? null,
    payrollMutualRatePct:
      initial.payrollMutualRatePct == null || initial.payrollMutualRatePct === ""
        ? null
        : Number(initial.payrollMutualRatePct),
  };
}
