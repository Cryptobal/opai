"use client";

import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { cn } from "@/lib/utils";
import {
  listEnabledQuoteVehicleBreakdowns,
  type QuoteVehicleCostInput,
} from "@/lib/cpq/quote-vehicle-costs";

interface QuoteVehicleCostsBreakdownProps {
  vehicles: QuoteVehicleCostInput[];
  displayCurrency?: string;
  ufValue?: number | null;
}

/**
 * Desglose de extras `kind=vehicle` (arriendo, combustible, mantención).
 * No renderiza costItems de catálogo ni extras de nombre libre.
 */
export function QuoteVehicleCostsBreakdown({
  vehicles,
  displayCurrency = "CLP",
  ufValue = null,
}: QuoteVehicleCostsBreakdownProps) {
  const rows = listEnabledQuoteVehicleBreakdowns(vehicles);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5 pb-1" data-testid="quote-vehicle-breakdown">
      {rows.map((row, index) => (
        <div key={row.id ?? `vehicle-${index}`} className="space-y-0.5">
          {(rows.length > 1 || row.vehiclesCount > 1) && (
            <div className={cn(CPQ_BREAKDOWN_ROW, "px-1 py-1 text-xs")}>
              <span className="text-sm font-medium break-words min-w-0">{row.label}</span>
              <div className={cpqBreakdownAmount()}>
                <CpqDualCurrencyAmount
                  clp={row.total}
                  currency={displayCurrency}
                  ufValue={ufValue}
                  size="xs"
                  primaryClassName="text-foreground font-semibold"
                />
              </div>
            </div>
          )}
          {row.parts.map((part) => (
            <div
              key={part.key}
              data-testid={`quote-vehicle-part-${part.key}`}
              className={cn(CPQ_BREAKDOWN_ROW, "px-1 py-1 text-xs")}
            >
              <span className="text-sm text-ds-text-3 break-words min-w-0 pl-2">
                {part.label}
              </span>
              <div className={cpqBreakdownAmount()}>
                <CpqDualCurrencyAmount
                  clp={part.amount}
                  currency={displayCurrency}
                  ufValue={ufValue}
                  size="xs"
                  primaryClassName={
                    part.amount > 0
                      ? "text-foreground font-medium"
                      : "text-ds-text-3 font-medium"
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
