"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatNumber, formatCLP, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import { formatCurrency } from "@/components/cpq/utils";

interface QuoteKpiBarProps {
  positionsCount: number;
  totalGuards: number;
  monthlyCost: number;
  marginPct: number;
  salePriceMonthly: number;
  ufValue: number | null;
  /** Total of additional lines (pass-through, no margin) */
  additionalLinesTotal?: number;
  /** Always show expanded (no toggle). Used in desktop sidebar. */
  alwaysExpanded?: boolean;
  className?: string;
}

/**
 * QuoteKpiBar — Barra de KPIs colapsable para cotización.
 *
 * Colapsada (default mobile): Precio de venta + UF + badge margen + chevron.
 * Expandida: Grid con Puestos, Guardias, Costo, Margen.
 *
 * Altura colapsada: ~44px. Expandida: ~90px.
 */
export function QuoteKpiBar({
  positionsCount,
  totalGuards,
  monthlyCost,
  marginPct,
  salePriceMonthly,
  ufValue,
  additionalLinesTotal = 0,
  alwaysExpanded = false,
  className,
}: QuoteKpiBarProps) {
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded);

  const totalSalePrice = salePriceMonthly + additionalLinesTotal;

  const ufDisplay =
    ufValue && ufValue > 0
      ? formatUFSuffix(clpToUf(totalSalePrice, ufValue))
      : null;

  const marginLabel = formatNumber(marginPct, {
    minDecimals: 1,
    maxDecimals: 1,
  });

  const marginAmount = (() => {
    const margin = marginPct / 100;
    if (margin >= 1 || margin <= 0) return 0;
    const costsBase = monthlyCost;
    const baseWithMargin = costsBase / (1 - margin);
    return baseWithMargin - costsBase;
  })();

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] overflow-hidden transition-all duration-200",
        className
      )}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => !alwaysExpanded && setIsExpanded((prev: boolean) => !prev)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left min-h-[44px]",
          !alwaysExpanded && "cursor-pointer"
        )}
      >
        {/* Sale price */}
        <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 truncate">
          {formatCLP(totalSalePrice)}
        </span>

        {/* UF equivalent */}
        {ufDisplay && (
          <span className="text-[11px] font-semibold text-emerald-600/70 dark:text-emerald-400/60 shrink-0">
            {ufDisplay}
          </span>
        )}

        <span className="flex-1" />

        {/* Margin badge */}
        <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
          {marginLabel}%
        </span>

        {/* Chevron — hidden when always expanded */}
        {!alwaysExpanded && (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Expanded details */}
      <div
        className={cn(
          "grid grid-cols-4 gap-2 px-3 overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-40 pb-2.5 pt-0.5 opacity-100" : "max-h-0 pb-0 pt-0 opacity-0"
        )}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Puestos
          </p>
          <p className="text-xs font-bold font-mono">{positionsCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Guardias
          </p>
          <p className="text-xs font-bold font-mono">{totalGuards}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Costo
          </p>
          <p className="text-xs font-bold font-mono truncate">
            {formatCurrency(monthlyCost)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Margen
          </p>
          <p className="text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400">
            {formatCurrency(marginAmount)}
          </p>
        </div>
      </div>

      {/* Additional lines breakdown */}
      {isExpanded && additionalLinesTotal > 0 && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between py-1 border-t border-purple-500/20">
            <span className="text-[10px] text-purple-400">Serv. adicionales</span>
            <span className="text-[11px] font-mono font-medium text-purple-400">
              {formatCurrency(additionalLinesTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
