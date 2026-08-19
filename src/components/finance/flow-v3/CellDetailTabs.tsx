"use client";

import type { ReactNode } from "react";
import { fmtShortDate } from "./format";
import { LAYER_LABEL } from "./cell-meta";

export type CellDetailTab = "composicion" | "historial";

interface Props {
  rowName: string;
  weekStart: string;
  layer: keyof typeof LAYER_LABEL | string;
  tab: CellDetailTab;
  onTabChange: (t: CellDetailTab) => void;
  children: ReactNode;
}

const TABS: Array<{ id: CellDetailTab; label: string }> = [
  { id: "composicion", label: "Composición" },
  { id: "historial", label: "Historial" },
];

/** Cabecera + pestañas del panel de detalle de celda. */
export function CellDetailTabs({
  rowName, weekStart, layer, tab, onTabChange, children,
}: Props) {
  const layerLabel = LAYER_LABEL[layer as keyof typeof LAYER_LABEL] ?? layer;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-ds-text-1">{rowName}</span>
        <span className="shrink-0 text-[12px] text-ds-text-3">
          sem {fmtShortDate(weekStart)} · {layerLabel}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Detalle de celda"
        className="flex gap-0.5 border-b border-ds-border-subtle"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={`h-8 px-2 text-[12px] font-medium focus-visible:ring-1 focus-visible:ring-primary/40 ${
              tab === t.id
                ? "border-b-2 border-primary text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-1.5 pt-1">
        {children}
      </div>
    </>
  );
}
