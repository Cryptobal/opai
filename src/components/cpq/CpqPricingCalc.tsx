/**
 * Cálculo de precio de venta CPQ — Visual hierarchy redesign
 */
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
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
}: CpqPricingCalcProps) {
  const [localMargin, setLocalMargin] = useState(marginPct);
  const [marginDraft, setMarginDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [costDetailOpen, setCostDetailOpen] = useState(false);
  const [hourlyRatesOpen, setHourlyRatesOpen] = useState(false);

  useEffect(() => {
    setLocalMargin(marginPct);
    setMarginDraft(formatNumber(marginPct, { minDecimals: 2, maxDecimals: 2 }));
    setDirty(false);
  }, [marginPct]);

  if (!summary) {
    return (
      <Card className="p-4 sm:p-5">
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
    directCosts + holidayCosts + uniformCosts + examCosts + mealCosts +
    operationalCosts + transportCosts + vehicleCosts + infraCosts + systemCosts;

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

  return (
    <div className="space-y-3">
      {/* Block 1: Costos */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setCostDetailOpen((v) => !v)}
          className="flex items-center justify-between w-full"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estructura de costos</h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold">{formatCurrency(costsBase)}</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", costDetailOpen && "rotate-180")} />
          </div>
        </button>

        {costDetailOpen && (
          <div className="mt-3 space-y-1 text-xs">
            <div className="text-[10px] font-semibold uppercase text-blue-400/80 border-b border-blue-500/20 pb-1">Costos directos</div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Mano de obra</span><span className="font-mono">{formatCurrency(directCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-emerald-400">Ajuste feriados ({summary.totalGuards} guardias)</span><span className="font-mono text-emerald-400">{formatCurrency(holidayCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Uniformes</span><span className="font-mono">{formatCurrency(uniformCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Exámenes</span><span className="font-mono">{formatCurrency(examCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Alimentación</span><span className="font-mono">{formatCurrency(mealCosts)}</span></div>

            <div className="text-[10px] font-semibold uppercase text-teal-400/80 border-b border-teal-500/20 pb-1 mt-2">Costos indirectos</div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Equipos operativos</span><span className="font-mono">{formatCurrency(operationalCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Transporte</span><span className="font-mono">{formatCurrency(transportCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Vehículos</span><span className="font-mono">{formatCurrency(vehicleCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Infraestructura</span><span className="font-mono">{formatCurrency(infraCosts)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-muted-foreground">Sistemas</span><span className="font-mono">{formatCurrency(systemCosts)}</span></div>

            <div className="text-[10px] font-semibold uppercase text-amber-400/80 border-b border-amber-500/20 pb-1 mt-2">Costos financieros</div>
            <div className="flex justify-between pl-2"><span className="text-amber-300">Costo financiero ({formatNumber(effectiveFinancialRatePct, { minDecimals: 2, maxDecimals: 2 })}%)</span><span className="font-mono text-amber-300">{formatCurrency(financialAmount)}</span></div>
            <div className="flex justify-between pl-2"><span className="text-purple-300">Póliza ({formatNumber(effectivePolicyRatePct, { minDecimals: 2, maxDecimals: 2 })}%)</span><span className="font-mono text-purple-300">{formatCurrency(policyAmount)}</span></div>

            <div className="flex justify-between border-t border-border/50 pt-2 mt-2 font-semibold">
              <span>Costos totales</span>
              <span className="font-mono">{formatCurrency(costsBase + financialAmount + policyAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Block 2: Margen */}
      <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Margen</p>
            <div className="flex items-center gap-2">
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
                className="h-10 w-20 text-center font-mono font-semibold text-lg bg-card/80 text-foreground border-emerald-600/40"
              />
              <span className="text-muted-foreground">%</span>
              {onMarginChange && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 px-3 text-xs border-emerald-600/40"
                  onClick={handleSaveMargin}
                  disabled={!dirty || saving}
                >
                  {saving ? "..." : "Guardar"}
                </Button>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Monto margen</p>
            <p className="font-mono text-lg font-semibold text-emerald-400">{formatCurrency(marginAmount)}</p>
          </div>
        </div>
      </div>

      {/* Block 3: Precio Venta (hero) */}
      <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 sm:p-5 text-center">
        <p className="text-xs text-muted-foreground mb-1">Precio venta mensual</p>
        <p className="font-mono text-2xl font-bold text-primary">{formatCurrency(salePriceMonthly)}</p>
      </div>

      {/* Hourly rates breakdown (expandable) */}
      {saleAllocationByPosition.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setHourlyRatesOpen((v) => !v)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor hora cliente por puesto</h3>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", hourlyRatesOpen && "rotate-180")} />
          </button>
          {hourlyRatesOpen && (
            <div className="mt-3 space-y-1.5">
              {saleAllocationByPosition.map(({ position, allocated, weight }) => {
                const guards = Math.max(1, Number(position.numGuards || 0));
                const hourlyRate = allocated > 0 ? allocated / guards / Math.max(1, monthlyHours) : 0;
                const positionName = position.customName || position.puestoTrabajo?.name || "Puesto";
                return (
                  <div key={position.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {positionName} ({formatNumber(weight * 100, { minDecimals: 1, maxDecimals: 1 })}%)
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold">{formatCurrency(hourlyRate)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
