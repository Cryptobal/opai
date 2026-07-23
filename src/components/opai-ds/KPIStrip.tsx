"use client";

/**
 * OPAI DS v3 — KPIStrip
 *
 * Franja horizontal compacta de KPIs de cabecera. Reemplaza a los `KPIGrid`
 * de tarjetas cuando los indicadores son **lectura periférica** (contexto
 * arriba de una tabla/listado), no el contenido principal de la página.
 *
 *   ┌───────────┬───────────┬───────────┬───────────┐
 *   │ ACTIVOS   │ EN TURNO  │ PPC       │ ATRASADOS │
 *   │ 128       │ 96        │ 4         │ 2         │
 *   └───────────┴───────────┴───────────┴───────────┘
 *
 * Desktop: fila con separadores. Móvil: chips scrolleables (sin scrollbar).
 *
 * ## KPIStrip vs KPICard
 *  - KPIStrip → indicadores secundarios/periféricos, densos, en una franja.
 *  - KPICard/KPIGrid → cuando la página ES un dashboard y los KPI son el
 *    contenido (con ícono, tendencia y jerarquía visual fuerte).
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KPIStripVariant = "default" | "ok" | "warn" | "danger" | "brand";

const VALUE_COLOR: Record<KPIStripVariant, string> = {
  default: "text-ds-text-1",
  ok: "text-status-ok-fg",
  warn: "text-status-warn-fg",
  danger: "text-status-danger-fg",
  brand: "text-primary",
};

export interface KPIStripItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  variant?: KPIStripVariant;
}

export interface KPIStripProps {
  items: KPIStripItem[];
  className?: string;
}

export function KPIStrip({ items, className }: KPIStripProps) {
  if (!items.length) return null;
  return (
    <div
      className={cn(
        "flex items-stretch overflow-x-auto rounded-xl border border-ds-border-subtle bg-ds-surface-1",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
    >
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          className={cn(
            "flex min-w-[8.5rem] flex-1 flex-col justify-center gap-0.5 px-4 py-3 shrink-0",
            i > 0 && "border-l border-ds-border-subtle",
          )}
        >
          <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 truncate">
            {it.label}
          </span>
          <span
            className={cn(
              "font-mono font-semibold tabular-nums leading-tight text-lg sm:text-xl truncate",
              VALUE_COLOR[it.variant ?? "default"],
            )}
          >
            {it.value}
          </span>
          {it.hint && (
            <span className="text-[12px] text-ds-text-3 truncate">{it.hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}
