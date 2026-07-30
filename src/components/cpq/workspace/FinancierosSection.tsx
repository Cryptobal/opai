"use client";

/**
 * Sección Gastos financieros (extraída de CpqQuoteDetail sin cambio visual).
 * En modo multi-instalación la tasa financiera se gobierna a nivel propuesta:
 * `proposalGoverned` deja los controles en solo lectura con link al Consolidado.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { SectionCard } from "./SectionCard";

export function FinancierosSection({
  open,
  onToggle,
  isLocked,
  costParams,
  updateParams,
  costSummary,
  savingFinancials,
  financialError,
  decimalDrafts,
  getDecimalValue,
  setDecimalValue,
  clearDecimalValue,
  proposalGoverned = false,
  onEditAtProposal,
}: {
  open: boolean;
  onToggle: () => void;
  isLocked: boolean;
  costParams: CpqQuoteParameters | null;
  updateParams: (patch: Partial<CpqQuoteParameters>) => void;
  costSummary: CpqQuoteCostSummary | null;
  savingFinancials: boolean;
  financialError: string | null;
  decimalDrafts: Record<string, string>;
  getDecimalValue: (key: string, value: number | null | undefined, decimals?: number, allowEmpty?: boolean) => string;
  setDecimalValue: (key: string, value: string) => void;
  clearDecimalValue: (key: string) => void;
  /** Multi-instalación: tasa financiera gobernada por la propuesta. */
  proposalGoverned?: boolean;
  onEditAtProposal?: () => void;
}) {
  const salePriceBase = Number(costParams?.salePriceBase ?? 0);
  const policyEnabled = costParams?.policyEnabled ?? false;
  const policyContractMonths = costParams?.policyContractMonths ?? 12;
  const policyContractPct = costParams?.policyContractPct ?? 20;

  return (
    <SectionCard
      id="sec-financieros"
      title="Gastos financieros"
      open={open}
      onToggle={onToggle}
      cardClassName="overflow-hidden scroll-mt-44 sm:scroll-mt-32"
      bodyClassName="space-y-2 bg-card/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4"
      bodyInert={isLocked}
      summary={
        costSummary && ((costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0)) > 0 ? (
          <span className="text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground">{formatCurrency((costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0))}</span>
          </span>
        ) : undefined
      }
      headerExtra={savingFinancials ? <span className="text-xs text-muted-foreground">Guardando...</span> : undefined}
    >
      {proposalGoverned && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-info-border bg-status-info-soft/30 px-3 py-2">
          <p className="text-xs text-status-info-fg">
            La tasa financiera se gobierna a nivel propuesta y aplica a todas las instalaciones.
          </p>
          {onEditAtProposal && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline min-h-[32px]"
              onClick={onEditAtProposal}
            >
              Editar a nivel propuesta →
            </button>
          )}
        </div>
      )}

      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {/* Costo financiero */}
        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">Financiero</span>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors",
                costParams?.financialEnabled
                  ? "bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg"
                  : "bg-muted/30 text-muted-foreground"
              )}
              onClick={() => updateParams({ financialEnabled: !costParams?.financialEnabled })}
              aria-pressed={costParams?.financialEnabled}
              disabled={proposalGoverned}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", costParams?.financialEnabled ? "bg-status-ok" : "bg-muted-foreground")} />
              {costParams?.financialEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base venta</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={getDecimalValue("salePriceBase", salePriceBase, 0, true)}
                onChange={(e) => setDecimalValue("salePriceBase", e.target.value)}
                onBlur={() => {
                  const raw = decimalDrafts.salePriceBase;
                  if (raw === undefined) return;
                  const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                  updateParams({ salePriceBase: Math.max(0, parsed), financialEnabled: true });
                  clearDecimalValue("salePriceBase");
                }}
                className="h-7 text-xs bg-card text-foreground border-border"
                placeholder="4.000.000"
                disabled={proposalGoverned}
              />
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tasa %</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={getDecimalValue("financialRatePct", costParams?.financialRatePct ?? 2.5, 2, true)}
                onChange={(e) => setDecimalValue("financialRatePct", e.target.value)}
                onBlur={() => {
                  const raw = decimalDrafts.financialRatePct;
                  if (raw === undefined) return;
                  const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                  updateParams({ financialRatePct: parsed, financialEnabled: true });
                  clearDecimalValue("financialRatePct");
                }}
                className="h-7 text-xs bg-card text-foreground border-border"
                placeholder="2,5"
                disabled={proposalGoverned}
              />
            </div>
          </div>
          {salePriceBase > 0 && (
            <div className="text-xs text-status-ok-fg dark:text-status-ok-fg">
              = {formatCurrency(salePriceBase * (Number(costParams?.financialRatePct ?? 2.5) / 100))}/mes
            </div>
          )}
        </div>

        {/* Poliza */}
        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">Poliza</span>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors",
                policyEnabled
                  ? "bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg"
                  : "bg-muted/30 text-muted-foreground"
              )}
              onClick={() => updateParams({ policyEnabled: !policyEnabled, financialEnabled: true })}
              aria-pressed={policyEnabled}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", policyEnabled ? "bg-status-ok" : "bg-muted-foreground")} />
              {policyEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meses</Label>
              <Input
                type="number"
                value={policyContractMonths}
                onChange={(e) =>
                  updateParams({
                    policyContractMonths: parseLocalizedNumber(e.target.value),
                    financialEnabled: true,
                  })
                }
                className="h-7 text-xs bg-card text-foreground border-border"
                placeholder="12"
              />
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">% Poliza</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={getDecimalValue("policyContractPct", Number(policyContractPct), 2)}
                onChange={(e) => setDecimalValue("policyContractPct", e.target.value)}
                onBlur={() => {
                  const raw = decimalDrafts.policyContractPct;
                  if (raw === undefined) return;
                  const parsed = raw.trim() ? parseLocalizedNumber(raw) : 20;
                  updateParams({ policyContractPct: parsed, financialEnabled: true });
                  clearDecimalValue("policyContractPct");
                }}
                className="h-7 text-xs bg-card text-foreground border-border"
                placeholder="20"
              />
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tasa %</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={getDecimalValue("policyRatePct", Number(costParams?.policyRatePct ?? 2.5), 2, true)}
                onChange={(e) => setDecimalValue("policyRatePct", e.target.value)}
                onBlur={() => {
                  const raw = decimalDrafts.policyRatePct;
                  if (raw === undefined) return;
                  const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                  updateParams({ policyRatePct: parsed, financialEnabled: true });
                  clearDecimalValue("policyRatePct");
                }}
                className="h-7 text-xs bg-card text-foreground border-border"
                placeholder="2,5"
              />
            </div>
          </div>
          {policyEnabled && salePriceBase > 0 && (
            <div className="text-xs text-status-ok-fg dark:text-status-ok-fg">
              = {formatCurrency(
                (salePriceBase * Number(policyContractMonths) * (Number(policyContractPct) / 100) * (Number(costParams?.policyRatePct ?? 2.5) / 100)) / 12
              )}/mes
            </div>
          )}
        </div>
      </div>

      {financialError && (
        <div className="text-sm text-status-danger-fg">{financialError}</div>
      )}
    </SectionCard>
  );
}
