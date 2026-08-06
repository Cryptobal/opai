"use client";

/**
 * Sección Gastos financieros — tres bloques: costo financiero, póliza de garantía
 * y póliza de responsabilidad civil. En multi-instalación la tasa financiera se
 * gobierna a nivel propuesta (`proposalGoverned`).
 */

import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { SectionCard } from "./SectionCard";
import { FinBlockFinanciero } from "./financieros/FinBlockFinanciero";
import { FinBlockGarantia } from "./financieros/FinBlockGarantia";
import { FinBlockRC } from "./financieros/FinBlockRC";

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
  currency = "CLP",
  ufValue = null,
  contractDuration = 12,
  insurancePolicyUF = null,
  onInsurancePolicyUFChange,
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
  proposalGoverned?: boolean;
  onEditAtProposal?: () => void;
  currency?: string;
  ufValue?: number | null;
  contractDuration?: number;
  insurancePolicyUF?: number | null;
  onInsurancePolicyUFChange?: (uf: number | null) => void;
}) {
  const instrumentsTotal =
    (costSummary?.monthlyFinancial ?? 0) +
    (costSummary?.monthlyPolicy ?? 0) +
    (costSummary?.monthlyPolicyAdmin ?? 0) +
    (costSummary?.monthlyLiability ?? 0);

  return (
    <SectionCard
      id="sec-financieros"
      title="Gastos financieros y garantías"
      open={open}
      onToggle={onToggle}
      cardClassName="overflow-hidden scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32"
      bodyClassName="space-y-2 bg-card/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4"
      bodyInert={isLocked}
      summary={
        instrumentsTotal > 0 ? (
          <span className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatCurrency(instrumentsTotal)}</span>
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
              className="min-h-[44px] text-xs font-semibold text-primary hover:underline sm:min-h-[32px]"
              onClick={onEditAtProposal}
            >
              Editar a nivel propuesta →
            </button>
          )}
        </div>
      )}

      {costSummary?.grossUpApplied === false &&
        (costSummary.financialWarnings ?? []).some((w) => w.includes("35")) && (
          <div className="rounded-md border border-status-warn-border bg-status-warn-soft/40 px-3 py-2 text-[12px] text-status-warn-fg">
            {(costSummary.financialWarnings ?? []).find((w) => w.includes("35"))}
          </div>
        )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FinBlockFinanciero
          costParams={costParams}
          updateParams={updateParams}
          costSummary={costSummary}
          isLocked={isLocked}
          proposalGoverned={proposalGoverned}
          decimalDrafts={decimalDrafts}
          getDecimalValue={getDecimalValue}
          setDecimalValue={setDecimalValue}
          clearDecimalValue={clearDecimalValue}
          currency={currency}
          ufValue={ufValue}
        />
        <FinBlockGarantia
          costParams={costParams}
          updateParams={updateParams}
          costSummary={costSummary}
          isLocked={isLocked}
          decimalDrafts={decimalDrafts}
          getDecimalValue={getDecimalValue}
          setDecimalValue={setDecimalValue}
          clearDecimalValue={clearDecimalValue}
          contractDuration={contractDuration}
          ufValue={ufValue}
        />
        <FinBlockRC
          costParams={costParams}
          updateParams={updateParams}
          costSummary={costSummary}
          isLocked={isLocked}
          decimalDrafts={decimalDrafts}
          getDecimalValue={getDecimalValue}
          setDecimalValue={setDecimalValue}
          clearDecimalValue={clearDecimalValue}
          insurancePolicyUF={insurancePolicyUF}
          onInsurancePolicyUFChange={onInsurancePolicyUFChange ?? (() => {})}
          ufValue={ufValue}
        />
      </div>

      {financialError && (
        <div className="text-sm text-status-danger-fg">{financialError}</div>
      )}
    </SectionCard>
  );
}
