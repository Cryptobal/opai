"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DTE_TYPE_LABELS,
  DTE_TYPE_SHORT_LABELS,
  DTE_TYPE_TAG_VARIANT,
} from "./shared/constants";
import type { DteFilters } from "./shared/types";

const VISTA_OPTIONS: Array<{
  value: DteFilters["quickFilter"];
  label: string;
  tone: "neutral" | "ok" | "warn" | "danger" | "info";
}> = [
  { value: "ALL", label: "Todos", tone: "neutral" },
  { value: "UNPAID", label: "Por cobrar", tone: "neutral" },
  { value: "PARTIAL", label: "Parcial", tone: "warn" },
  { value: "PAID", label: "Pagado", tone: "ok" },
  { value: "OVERDUE", label: "Vencido", tone: "danger" },
  { value: "DRAFT", label: "Borradores", tone: "info" },
];

const TONE_ACTIVE: Record<string, string> = {
  neutral: "bg-ds-surface-3 border-ds-border-default text-ds-text-1",
  brand: "bg-primary/15 border-primary/40 text-primary",
  ok: "bg-status-ok-soft border-status-ok-border text-status-ok-fg",
  warn: "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
  danger: "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
  info: "bg-status-info-soft border-status-info-border text-status-info-fg",
};

const PILL_IDLE =
  "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3";

function FilterPill({
  active,
  onClick,
  children,
  tone = "neutral",
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
        active ? (TONE_ACTIVE[tone] ?? TONE_ACTIVE.neutral) : PILL_IDLE,
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  quickFilter: DteFilters["quickFilter"];
  onQuickFilter: (value: DteFilters["quickFilter"]) => void;
  types: number[];
  onToggleType: (type: number) => void;
}

/**
 * Chips visibles de Vista (estado de pago, radio) y Tipo (documento, multi-select).
 * El default de tipo es Factura electrónica (33); se puede marcar uno, varios, todos o ninguno.
 */
export function DteQuickFilters({
  quickFilter,
  onQuickFilter,
  types,
  onToggleType,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 -mt-1">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Vista"
      >
        <span className="text-xs font-mono uppercase tracking-wide text-ds-text-4 mr-1">
          Vista:
        </span>
        {VISTA_OPTIONS.map((opt) => (
          <FilterPill
            key={opt.value}
            active={quickFilter === opt.value}
            onClick={() => onQuickFilter(opt.value)}
            tone={opt.tone}
          >
            {opt.label}
          </FilterPill>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Tipo de documento"
      >
        <span className="text-xs font-mono uppercase tracking-wide text-ds-text-4 mr-1">
          Tipo:
        </span>
        {Object.entries(DTE_TYPE_LABELS).map(([k, fullLabel]) => {
          const t = Number(k);
          return (
            <FilterPill
              key={k}
              active={types.includes(t)}
              onClick={() => onToggleType(t)}
              tone={DTE_TYPE_TAG_VARIANT[t] ?? "neutral"}
              title={fullLabel}
            >
              {DTE_TYPE_SHORT_LABELS[t] ?? fullLabel}
            </FilterPill>
          );
        })}
      </div>
    </div>
  );
}
