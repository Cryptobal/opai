"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuoteParameters } from "@/types/cpq";
import { useState } from "react";

export interface FinancialCostsData {
  financialEnabled: boolean;
  financialRatePct: number;
  salePriceBase: number;
  policyEnabled: boolean;
  policyRatePct: number;
  policyContractMonths: number;
  policyContractPct: number;
}

interface FinancialCostsSectionProps {
  value: FinancialCostsData;
  onChange: (data: FinancialCostsData) => void;
  isLocked?: boolean;
}

export function FinancialCostsSection({ value, onChange, isLocked }: FinancialCostsSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const getDraft = (key: string, val: number, decimals = 2) => {
    if (key in drafts) return drafts[key];
    return formatNumber(val, { minDecimals: decimals, maxDecimals: decimals });
  };
  const setDraft = (key: string, v: string) => setDrafts((prev) => ({ ...prev, [key]: v }));
  const clearDraft = (key: string) => setDrafts((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const update = (patch: Partial<FinancialCostsData>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
      {/* Costo financiero */}
      <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">Financiero</span>
          <button
            type="button"
            disabled={isLocked}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              value.financialEnabled
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/30 text-muted-foreground"
            )}
            onClick={() => update({ financialEnabled: !value.financialEnabled })}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", value.financialEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
            {value.financialEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[10px] text-muted-foreground">Base venta</Label>
            <Input
              type="text"
              inputMode="numeric"
              disabled={isLocked}
              value={getDraft("salePriceBase", value.salePriceBase, 0)}
              onChange={(e) => setDraft("salePriceBase", e.target.value)}
              onBlur={() => {
                const raw = drafts.salePriceBase;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                update({ salePriceBase: Math.max(0, parsed), financialEnabled: true });
                clearDraft("salePriceBase");
              }}
              className="h-7 text-xs bg-card text-foreground border-border"
              placeholder="4.000.000"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Tasa %</Label>
            <Input
              type="text"
              inputMode="decimal"
              disabled={isLocked}
              value={getDraft("financialRatePct", value.financialRatePct)}
              onChange={(e) => setDraft("financialRatePct", e.target.value)}
              onBlur={() => {
                const raw = drafts.financialRatePct;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                update({ financialRatePct: parsed, financialEnabled: true });
                clearDraft("financialRatePct");
              }}
              className="h-7 text-xs bg-card text-foreground border-border"
              placeholder="2,5"
            />
          </div>
        </div>
        {value.salePriceBase > 0 && (
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
            = {formatCurrency(value.salePriceBase * (value.financialRatePct / 100))}/mes
          </div>
        )}
      </div>

      {/* Poliza */}
      <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold">Poliza</span>
          <button
            type="button"
            disabled={isLocked}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              value.policyEnabled
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/30 text-muted-foreground"
            )}
            onClick={() => update({ policyEnabled: !value.policyEnabled })}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", value.policyEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
            {value.policyEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <div>
            <Label className="text-[10px] text-muted-foreground">Meses</Label>
            <Input
              type="number"
              disabled={isLocked}
              value={value.policyContractMonths}
              onChange={(e) => update({ policyContractMonths: parseLocalizedNumber(e.target.value), financialEnabled: true })}
              className="h-7 text-xs bg-card text-foreground border-border"
              placeholder="12"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">% Poliza</Label>
            <Input
              type="text"
              inputMode="decimal"
              disabled={isLocked}
              value={getDraft("policyContractPct", value.policyContractPct)}
              onChange={(e) => setDraft("policyContractPct", e.target.value)}
              onBlur={() => {
                const raw = drafts.policyContractPct;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 20;
                update({ policyContractPct: parsed, financialEnabled: true });
                clearDraft("policyContractPct");
              }}
              className="h-7 text-xs bg-card text-foreground border-border"
              placeholder="20"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Tasa %</Label>
            <Input
              type="text"
              inputMode="decimal"
              disabled={isLocked}
              value={getDraft("policyRatePct", value.policyRatePct)}
              onChange={(e) => setDraft("policyRatePct", e.target.value)}
              onBlur={() => {
                const raw = drafts.policyRatePct;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                update({ policyRatePct: parsed, financialEnabled: true });
                clearDraft("policyRatePct");
              }}
              className="h-7 text-xs bg-card text-foreground border-border"
              placeholder="2,5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function financialCostsDataFromParams(params: CpqQuoteParameters | null): FinancialCostsData {
  return {
    financialEnabled: params?.financialEnabled ?? false,
    financialRatePct: params?.financialRatePct ?? 2.5,
    salePriceBase: params?.salePriceBase ?? 0,
    policyEnabled: params?.policyEnabled ?? false,
    policyRatePct: params?.policyRatePct ?? 2.5,
    policyContractMonths: params?.policyContractMonths ?? 12,
    policyContractPct: params?.policyContractPct ?? 100,
  };
}
