"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

export type FilterType = "all" | "income" | "expense";
export type FilterState = "all" | "pending" | "matched" | "excluded";

interface Counts {
  total: number;
  income: number;
  expense: number;
  pending: number;
  matched: number;
  excluded: number;
}

interface Props {
  search: string;
  setSearch: (s: string) => void;
  fType: FilterType;
  setFType: (f: FilterType) => void;
  fState: FilterState;
  setFState: (f: FilterState) => void;
  counts: Counts;
  visibleCount: number;
}

type ChipColor = "brand" | "ok" | "danger" | "warn" | "text3";

const CHIP_VAR: Record<ChipColor, string> = {
  brand: "var(--primary)",
  ok: "var(--ds-ok)",
  danger: "var(--ds-danger)",
  warn: "var(--ds-warn)",
  text3: "var(--ds-text-3)",
};

export function CuadraturaFilters({
  search, setSearch, fType, setFType, fState, setFState, counts, visibleCount,
}: Props) {
  const filtersActive = fType !== "all" || fState !== "all" || !!search;
  return (
    <div className="space-y-3 rounded-ds-lg border border-ds-border-default bg-ds-surface-2 p-3">
      <div className="flex items-center gap-2 rounded-ds-md bg-ds-surface-3 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-ds-text-3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar concepto, RUT o cuenta…"
          className="flex-1 bg-transparent text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-3"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="p-0.5">
            <X className="h-3.5 w-3.5 text-ds-text-3" />
          </button>
        )}
      </div>

      {/* TIPO */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
          Tipo
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={fType === "all"} onClick={() => setFType("all")} count={counts.total}>
            Todos
          </Chip>
          <Chip active={fType === "income"} color="ok" onClick={() => setFType("income")} count={counts.income}>
            + Ingresos
          </Chip>
          <Chip active={fType === "expense"} color="danger" onClick={() => setFType("expense")} count={counts.expense}>
            − Egresos
          </Chip>
        </div>
      </div>

      {/* ESTADO */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
          Estado
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={fState === "all"} onClick={() => setFState("all")} count={counts.total}>
            Todos
          </Chip>
          <Chip active={fState === "pending"} color="warn" onClick={() => setFState("pending")} count={counts.pending}>
            ⚠ Pendientes
          </Chip>
          <Chip active={fState === "matched"} color="ok" onClick={() => setFState("matched")} count={counts.matched}>
            ✓ Conciliados
          </Chip>
          <Chip active={fState === "excluded"} color="text3" onClick={() => setFState("excluded")} count={counts.excluded}>
            ↶ Excluidos
          </Chip>
        </div>
      </div>

      {filtersActive && (
        <div className="flex items-center justify-between border-t border-ds-border-default pt-2">
          <span className="text-[10px] text-ds-text-3">
            Mostrando <b className="text-ds-text-2">{visibleCount}</b> de{" "}
            <b className="text-ds-text-2">{counts.total}</b> mov
          </span>
          <button
            type="button"
            onClick={() => { setSearch(""); setFType("all"); setFState("all"); }}
            className="text-[11px] font-semibold text-primary underline"
          >
            limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  active, onClick, color = "brand", count, children,
}: {
  active: boolean;
  onClick: () => void;
  color?: ChipColor;
  count?: number;
  children: ReactNode;
}) {
  const c = CHIP_VAR[color];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-ds-pill px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95"
      style={{
        background: active ? c : "var(--ds-surface-3)",
        color: active ? "#fff" : "var(--ds-text-2)",
        border: `1.5px solid ${active ? c : "var(--ds-border-default)"}`,
        boxShadow: active ? `0 0 0 2px ${c}33` : undefined,
        minHeight: 34,
      }}
    >
      <span>{children}</span>
      {count != null && (
        <span
          className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
          style={{
            background: active ? "rgba(255,255,255,0.22)" : "var(--ds-surface-2)",
            color: active ? "#fff" : "var(--ds-text-3)",
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
