"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

export type FilterType = "all" | "income" | "expense";
export type FilterState = "all" | "pending" | "matched" | "excluded";

interface Props {
  search: string;
  setSearch: (s: string) => void;
  fType: FilterType;
  setFType: (f: FilterType) => void;
  fState: FilterState;
  setFState: (f: FilterState) => void;
  visibleCount: number;
  totalCount: number;
}

type ChipColor = "brand" | "ok" | "danger" | "warn" | "text3";

const CHIP_VAR: Record<ChipColor, string> = {
  brand: "var(--primary)",
  ok: "var(--ds-ok)",
  danger: "var(--ds-danger)",
  warn: "var(--ds-warn)",
  text3: "var(--ds-text-3)",
};

/** Filtros del modal de cuadratura: búsqueda + chips de tipo y estado,
 *  combinables. */
export function CuadraturaFilters({
  search,
  setSearch,
  fType,
  setFType,
  fState,
  setFState,
  visibleCount,
  totalCount,
}: Props) {
  const filtersActive = fType !== "all" || fState !== "all" || !!search;
  return (
    <div className="space-y-2.5 rounded-ds-lg border border-ds-border-default bg-ds-surface-2 p-3">
      <div className="flex items-center gap-2 rounded-ds-md bg-ds-surface-3 px-2.5 py-1.5">
        <Search className="h-3 w-3 text-ds-text-3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar concepto, RUT o cuenta…"
          className="flex-1 bg-transparent text-[12px] text-ds-text-1 outline-none placeholder:text-ds-text-3"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="p-0.5">
            <X className="h-3 w-3 text-ds-text-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
          Tipo
        </span>
        <Chip active={fType === "all"} onClick={() => setFType("all")}>
          Todos
        </Chip>
        <Chip active={fType === "income"} color="ok" onClick={() => setFType("income")}>
          + Ingresos
        </Chip>
        <Chip active={fType === "expense"} color="danger" onClick={() => setFType("expense")}>
          − Egresos
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
          Estado
        </span>
        <Chip active={fState === "all"} onClick={() => setFState("all")}>
          Todos
        </Chip>
        <Chip active={fState === "pending"} color="warn" onClick={() => setFState("pending")}>
          ⚠ Pendientes
        </Chip>
        <Chip active={fState === "matched"} color="ok" onClick={() => setFState("matched")}>
          ✓ Conciliados
        </Chip>
        <Chip active={fState === "excluded"} color="text3" onClick={() => setFState("excluded")}>
          ↶ Excluidos
        </Chip>
      </div>
      {filtersActive && (
        <div className="flex items-center justify-between border-t border-ds-border-default pt-1">
          <span className="text-[10px] text-ds-text-3">
            Mostrando <b className="text-ds-text-2">{visibleCount}</b> de{" "}
            <b className="text-ds-text-2">{totalCount}</b> mov
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFType("all");
              setFState("all");
            }}
            className="text-[10px] text-primary underline"
          >
            limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  color = "brand",
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: ChipColor;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded-ds-pill px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95"
      style={{
        background: active ? CHIP_VAR[color] : "var(--ds-surface-2)",
        color: active ? "#fff" : "var(--ds-text-2)",
        border: `1px solid ${active ? CHIP_VAR[color] : "var(--ds-border-default)"}`,
      }}
    >
      {children}
    </button>
  );
}
