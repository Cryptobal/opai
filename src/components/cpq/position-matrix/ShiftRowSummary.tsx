/**
 * Resumen de 1 línea de un turno (estado colapsado). Click → expande el editor.
 */
"use client";

import { ChevronDown, Loader2, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { isNightShift, diasLabel, analizarTurno } from "./shift-utils";
import { JornadaHoursChip } from "./JornadaHoursChip";
import type { CpqCatalogOption, NormalizedShift } from "./types";

interface Props {
  row: NormalizedShift;
  puestos: CpqCatalogOption[];
  roles?: CpqCatalogOption[];
  currency: string;
  ufValue?: number | null;
  expanded: boolean;
  saving?: boolean;
  onToggle: () => void;
}

export function ShiftRowSummary({
  row,
  puestos,
  roles,
  currency,
  ufValue,
  expanded,
  saving,
  onToggle,
}: Props) {
  const night = isNightShift(row.inicio);
  const puestoName = puestos.find((p) => p.id === row.puestoId)?.name || "Puesto";
  const customName = row.customName?.trim();
  const totalGuards = row.guardias * (row.nPuestos || 1);
  const rolName = roles?.find((r) => r.id === row.rolId)?.name;
  const jornada = analizarTurno({ inicio: row.inicio, fin: row.fin, dias: row.dias, rolName });

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors min-h-[44px]",
        expanded
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-muted/30"
      )}
    >
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-semibold shrink-0",
          night
            ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
            : "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
        )}
      >
        {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
        {night ? "Noche" : "Día"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{customName || puestoName}</div>
        {customName && (
          <div className="truncate text-[11px] text-muted-foreground">{puestoName}</div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">
            {row.inicio}–{row.fin}
          </span>
          <span>·</span>
          <span>{diasLabel(row.dias)}</span>
          <span>·</span>
          <span className="font-mono">
            {row.guardias}g × {row.nPuestos || 1} pto{(row.nPuestos || 1) !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <JornadaHoursChip analysis={jornada} variant="compact" />
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end sm:flex">
        <CpqDualCurrencyAmount
          clp={row.costo ?? 0}
          currency={currency}
          ufValue={ufValue}
          size="sm"
          primaryClassName="font-semibold text-foreground"
          align="right"
        />
        <span className="font-mono text-xs text-muted-foreground">
          bruto {totalGuards > 0 ? row.bruto.toLocaleString("es-CL") : 0}
        </span>
      </div>

      {saving ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      )}
    </button>
  );
}
