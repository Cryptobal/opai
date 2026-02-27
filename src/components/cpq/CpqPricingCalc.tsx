/**
 * Cálculo de precio de venta CPQ
 */
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/components/cpq/utils";
import { formatNumber, parseLocalizedNumber, formatCLP, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import type { CpqPosition, CpqQuoteCostSummary } from "@/types/cpq";

interface CpqPricingCalcProps {
  summary: CpqQuoteCostSummary | null;
  marginPct: number;
  onMarginChange?: (margin: number) => void;
  uniformTotal?: number;
  examTotal?: number;
  mealTotal?: number;
  operationalTotal?: number;
  transportTotal?: number;
  vehicleTotal?: number;
  infraTotal?: number;
  systemTotal?: number;
  financialRatePct?: number;
  policyRatePct?: number;
  policyContractMonths?: number;
  policyContractPct?: number;
  contractMonths?: number;
  positions?: CpqPosition[];
  monthlyHours?: number;
  ufValue?: number | null;
  additionalLinesTotal?: number;
}

export function CpqPricingCalc({
  summary,
  marginPct,
  onMarginChange,
  uniformTotal,
  examTotal,
  mealTotal,
  operationalTotal,
  transportTotal,
  vehicleTotal,
  infraTotal,
  systemTotal,
  financialRatePct,
  policyRatePct,
  policyContractMonths,
  policyContractPct,
  contractMonths,
  positions = [],
  monthlyHours = 180,
  ufValue,
  additionalLinesTotal = 0,
}: CpqPricingCalcProps) {
  const [localMargin, setLocalMargin] = useState(marginPct);
  const [marginDraft, setMarginDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalMargin(marginPct);
    setMarginDraft(formatNumber(marginPct, { minDecimals: 2, maxDecimals: 2 }));
    setDirty(false);
  }, [marginPct]);

  if (!summary) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Cálculo de cotización</h2>
        <div className="text-sm text-muted-foreground">
          Configura costos adicionales para ver el cálculo.
        </div>
      </Card>
    );
  }

  const margin = localMargin / 100;
  
  const directCosts = summary.monthlyPositions;
  const uniformCosts = uniformTotal ?? summary.monthlyUniforms;
  const examCosts = examTotal ?? summary.monthlyExams;
  const mealCosts = mealTotal ?? summary.monthlyMeals;
  const holidayCosts = summary.monthlyHolidayAdjustment ?? 0;
  const operationalCosts = operationalTotal ?? 0;
  const transportCosts = transportTotal ?? 0;
  const vehicleCosts = vehicleTotal ?? summary.monthlyVehicles;
  const infraCosts = infraTotal ?? summary.monthlyInfrastructure;
  const systemCosts = systemTotal ?? 0;
  
  const costsBase =
    directCosts +
    holidayCosts +
    uniformCosts +
    examCosts +
    mealCosts +
    operationalCosts +
    transportCosts +
    vehicleCosts +
    infraCosts +
    systemCosts;

  const baseWithMargin = margin < 1 ? costsBase / (1 - margin) : costsBase;
  const policyMonths = policyContractMonths ?? 12;
  const policyPct = policyContractPct ?? 100;
  const policyContractBase = contractMonths ?? 12;
  const policyFactor =
    policyContractBase > 0 ? (policyMonths * (policyPct / 100)) / policyContractBase : 0;

  const derivedFinancialRatePct =
    baseWithMargin > 0 ? (summary.monthlyFinancial / baseWithMargin) * 100 : 0;
  const derivedPolicyRatePct =
    baseWithMargin > 0 && policyFactor > 0
      ? (summary.monthlyPolicy / (baseWithMargin * policyFactor)) * 100
      : 0;
  const effectiveFinancialRatePct = financialRatePct ?? derivedFinancialRatePct;
  const effectivePolicyRatePct = policyRatePct ?? derivedPolicyRatePct;

  const marginAmount = baseWithMargin - costsBase;
  const financialAmount = summary.monthlyFinancial;
  const policyAmount = summary.monthlyPolicy;
  const salePriceMonthly = baseWithMargin + financialAmount + policyAmount;
  const positionWeights = positions.map((position) => Math.max(0, Number(position.monthlyPositionCost)));
  const positionWeightsTotal = positionWeights.reduce((sum, value) => sum + value, 0);
  const fallbackWeight = positions.length > 0 ? 1 / positions.length : 0;
  let remainingSaleForAllocation = salePriceMonthly;
  const saleAllocationByPosition = positions.map((position, index) => {
    if (index === positions.length - 1) {
      const allocated = Math.max(0, remainingSaleForAllocation);
      return { position, allocated, weight: positionWeightsTotal > 0 ? positionWeights[index] / positionWeightsTotal : fallbackWeight };
    }
    const weight = positionWeightsTotal > 0 ? positionWeights[index] / positionWeightsTotal : fallbackWeight;
    const allocated = salePriceMonthly * weight;
    remainingSaleForAllocation -= allocated;
    return { position, allocated, weight };
  });

  const handleSaveMargin = async () => {
    if (!onMarginChange) return;
    setSaving(true);
    try {
      await Promise.resolve(onMarginChange(localMargin));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const [showHourly, setShowHourly] = useState(false);

  const CostRow = ({ label, value, className: cls }: { label: string; value: number; className?: string }) => (
    <div className={`flex justify-between items-center py-0.5 ${cls || ""}`}>
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className="font-mono text-[11px] shrink-0 ml-2">{formatCurrency(value)}</span>
    </div>
  );

  return (
    <Card className="p-2.5 space-y-1.5">
      <h2 className="text-xs font-semibold">Cálculo de cotización</h2>

      <div className="grid gap-0">
        {/* Directos */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-blue-500/20 pb-0.5 mb-0.5">Directos</div>
        <CostRow label="Mano de obra" value={directCosts} />
        <CostRow label={`Feriados (${summary.totalGuards} guardias)`} value={holidayCosts} className="text-emerald-700 dark:text-emerald-400" />
        <CostRow label="Uniformes" value={uniformCosts} />
        <CostRow label="Exámenes" value={examCosts} />
        <CostRow label="Alimentación" value={mealCosts} />

        {/* Indirectos */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400 border-b border-teal-500/20 pb-0.5 mb-0.5 mt-1.5">Indirectos</div>
        <CostRow label="Equipos" value={operationalCosts} />
        <CostRow label="Transporte" value={transportCosts} />
        <CostRow label="Vehículos" value={vehicleCosts} />
        <CostRow label="Infraestructura" value={infraCosts} />
        <CostRow label="Sistemas" value={systemCosts} />

        <div className="flex justify-between items-center border-t border-border/40 pt-1 mt-1">
          <span className="text-xs text-muted-foreground font-semibold">Subtotal base</span>
          <span className="font-mono text-xs font-semibold">{formatCurrency(costsBase)}</span>
        </div>

        {/* Porcentuales */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 border-b border-amber-500/20 pb-0.5 mb-0.5 mt-1.5">Porcentuales</div>
        <div className="flex justify-between items-center py-0.5 text-amber-700 dark:text-amber-400">
          <span className="text-[11px]">Financiero ({formatNumber(effectiveFinancialRatePct, { minDecimals: 2, maxDecimals: 2 })}%)</span>
          <span className="font-mono text-[11px]">{formatCurrency(financialAmount)}</span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-purple-700 dark:text-purple-400">
          <span className="text-[11px]">Póliza ({formatNumber(effectivePolicyRatePct, { minDecimals: 2, maxDecimals: 2 })}%)</span>
          <span className="font-mono text-[11px]">{formatCurrency(policyAmount)}</span>
        </div>

        <div className="flex justify-between items-center border-t border-border/40 pt-1 mt-1">
          <span className="text-xs text-muted-foreground font-semibold">Total costos</span>
          <span className="font-mono text-xs font-semibold">{formatCurrency(costsBase + financialAmount + policyAmount)}</span>
        </div>

        {/* Margen */}
        <div className="flex items-center justify-between gap-2 text-emerald-700 dark:text-emerald-400 mt-1.5 py-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold">Margen</span>
            <Input
              type="text"
              inputMode="decimal"
              value={marginDraft}
              onChange={(e) => {
                setMarginDraft(e.target.value);
                const value = parseLocalizedNumber(e.target.value || "0");
                setLocalMargin(value);
                setDirty(true);
              }}
              onBlur={() => {
                setMarginDraft(formatNumber(localMargin, { minDecimals: 2, maxDecimals: 2 }));
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="h-7 w-16 text-xs bg-card/80 text-foreground border-emerald-500/40 placeholder:text-muted-foreground"
            />
            <span className="text-[11px]">%</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={handleSaveMargin}
              disabled={!dirty || saving}
            >
              {saving ? "..." : "OK"}
            </Button>
          </div>
          <span className="font-mono text-xs font-semibold">{formatCurrency(marginAmount)}</span>
        </div>

        {/* Additional lines (pass-through) */}
        {additionalLinesTotal > 0 && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 border-b border-purple-500/20 pb-0.5 mb-0.5 mt-1.5">Servicios adicionales</div>
            <div className="flex justify-between items-center py-0.5 text-purple-700 dark:text-purple-400">
              <span className="text-[11px]">Líneas adicionales</span>
              <span className="font-mono text-[11px]">{formatCurrency(additionalLinesTotal)}</span>
            </div>
          </>
        )}

        {/* Sale price highlight — prominent block */}
        <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Venta mensual
            </span>
            <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
              {formatCLP(salePriceMonthly + additionalLinesTotal)}
            </span>
          </div>
          {additionalLinesTotal > 0 && (
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>Guardias: {formatCLP(salePriceMonthly)}</span>
              <span>Adicionales: {formatCLP(additionalLinesTotal)}</span>
            </div>
          )}
          {ufValue && ufValue > 0 && (
            <div className="mt-0.5 text-right">
              <span className="font-mono text-[11px] font-semibold text-emerald-600/70 dark:text-emerald-400/60">
                {formatUFSuffix(clpToUf(salePriceMonthly + additionalLinesTotal, ufValue))}
              </span>
            </div>
          )}
        </div>

        {/* Hourly rate per position - collapsible */}
        {saleAllocationByPosition.length > 0 && (
          <div className="mt-1.5 border-t border-emerald-500/20 pt-1">
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              onClick={() => setShowHourly(!showHourly)}
            >
              {showHourly ? "▾" : "▸"} Valor hora por puesto
            </button>
            {showHourly && (
              <div className="mt-1 space-y-0.5">
                {saleAllocationByPosition.map(({ position, allocated, weight }) => {
                  const guards = Math.max(1, Number(position.numGuards || 0));
                  const hourlyRate = allocated > 0 ? allocated / guards / Math.max(1, monthlyHours) : 0;
                  const positionName = position.customName || position.puestoTrabajo?.name || "Puesto";
                  return (
                    <div key={position.id} className="flex items-center justify-between pl-2 text-[11px]">
                      <span className="text-muted-foreground truncate">
                        {positionName} ({formatNumber(weight * 100, { minDecimals: 1, maxDecimals: 1 })}%)
                      </span>
                      <span className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0 ml-2">{formatCurrency(hourlyRate)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
