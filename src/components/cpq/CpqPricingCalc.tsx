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
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type { CpqQuoteCostSummary } from "@/types/cpq";

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
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Cálculo detallado de cotización</h2>
      
      <div className="grid gap-1.5 text-sm">
        <div className="text-xs font-semibold uppercase text-blue-300/80 border-b border-blue-500/30 pb-1">
          Costos directos
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Mano de obra</span>
          <span className="font-mono text-xs">{formatCurrency(directCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Ajuste feriados</span>
          <span className="font-mono text-xs">{formatCurrency(holidayCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Uniformes</span>
          <span className="font-mono text-xs">{formatCurrency(uniformCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Exámenes</span>
          <span className="font-mono text-xs">{formatCurrency(examCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Alimentación</span>
          <span className="font-mono text-xs">{formatCurrency(mealCosts)}</span>
        </div>
        
        <div className="text-xs font-semibold uppercase text-teal-300/80 border-b border-teal-500/30 pb-1 mt-2">
          Costos indirectos
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Equipos operativos</span>
          <span className="font-mono text-xs">{formatCurrency(operationalCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Costos de transporte</span>
          <span className="font-mono text-xs">{formatCurrency(transportCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Vehículos</span>
          <span className="font-mono text-xs">{formatCurrency(vehicleCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Infraestructura</span>
          <span className="font-mono text-xs">{formatCurrency(infraCosts)}</span>
        </div>
        <div className="flex justify-between items-center pl-2">
          <span className="text-muted-foreground text-xs">Sistemas</span>
          <span className="font-mono text-xs">{formatCurrency(systemCosts)}</span>
        </div>
        
        <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-1">
          <span className="text-muted-foreground font-semibold">Subtotal costos base</span>
          <span className="font-mono font-semibold">{formatCurrency(costsBase)}</span>
        </div>
        
        <div className="text-xs font-semibold uppercase text-amber-300/80 border-b border-amber-500/30 pb-1 mt-2">
          Costos porcentuales
        </div>
        <div className="flex justify-between items-center pl-2 text-amber-300">
          <span className="text-xs">
            Costo financiero ({formatNumber(effectiveFinancialRatePct, { minDecimals: 2, maxDecimals: 2 })}%)
          </span>
          <span className="font-mono text-xs">{formatCurrency(financialAmount)}</span>
        </div>
        <div className="flex justify-between items-center pl-2 text-purple-300">
          <span className="text-xs">
            Póliza ({formatNumber(effectivePolicyRatePct, { minDecimals: 2, maxDecimals: 2 })}%)
          </span>
          <span className="font-mono text-xs">{formatCurrency(policyAmount)}</span>
        </div>
        
        <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-1">
          <span className="text-muted-foreground font-semibold">Costos totales</span>
          <span className="font-mono font-semibold">{formatCurrency(costsBase + financialAmount + policyAmount)}</span>
        </div>
        
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-emerald-300 mt-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Margen</span>
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
              className="h-7 w-20 text-xs bg-card/80 text-foreground border-emerald-600/40 placeholder:text-muted-foreground"
            />
            <span className="text-xs">%</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={handleSaveMargin}
              disabled={!dirty || saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
          <span className="font-mono font-semibold">{formatCurrency(marginAmount)}</span>
        </div>
        
        <div className="flex justify-between items-center border-t-2 border-emerald-500/50 pt-2 mt-2 text-base font-bold text-emerald-400">
          <span>Precio venta mensual</span>
          <span className="font-mono">{formatCurrency(salePriceMonthly)}</span>
        </div>
      </div>
    </Card>
  );
}
