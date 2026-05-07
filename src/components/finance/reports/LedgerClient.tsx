"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import type {
  LedgerAccountListItem,
} from "@/modules/finance/reports/shared/types";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Patrimonio",
  REVENUE: "Ingreso",
  COST: "Costo",
  EXPENSE: "Gasto",
};

const TYPE_TONE: Record<string, string> = {
  ASSET: "var(--ds-tint-emerald)",
  LIABILITY: "var(--ds-tint-amber)",
  EQUITY: "var(--ds-tint-violet)",
  REVENUE: "var(--ds-tint-emerald)",
  COST: "var(--ds-tint-rose)",
  EXPENSE: "var(--ds-tint-amber)",
};

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COST", "EXPENSE"] as const;

export function LedgerClient({ accounts }: { accounts: LedgerAccountListItem[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter && a.type !== typeFilter) return false;
      if (hideEmpty && a.movementsCount === 0) return false;
      if (!q) return true;
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    });
  }, [accounts, search, typeFilter, hideEmpty]);

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-2 rounded-lg border bg-ds-surface px-3 h-10"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <Search className="w-3.5 h-3.5 text-ds-text-3" />
        <input
          type="text"
          placeholder="Buscar cuenta por código o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-[12.5px] text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter(null)}
          className="h-8 px-3 rounded-md text-[11.5px] border"
          style={{
            background: !typeFilter ? "var(--ds-bg-2)" : "var(--ds-surface)",
            borderColor: "var(--ds-border)",
            color: !typeFilter ? "var(--ds-text-1)" : "var(--ds-text-3)",
          }}
        >
          Todas
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            className="h-8 px-3 rounded-md text-[11.5px] border"
            style={{
              background:
                typeFilter === t
                  ? `color-mix(in oklab, ${TYPE_TONE[t]} 15%, transparent)`
                  : "var(--ds-surface)",
              borderColor: typeFilter === t ? TYPE_TONE[t] : "var(--ds-border)",
              color: typeFilter === t ? TYPE_TONE[t] : "var(--ds-text-3)",
            }}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-[11.5px] text-ds-text-3">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Ocultar cuentas sin movimientos
        </label>
      </div>

      <div
        className="rounded-xl border bg-ds-surface overflow-hidden"
        style={{ borderColor: "var(--ds-border)" }}
      >
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-[12.5px] text-ds-text-3">
            Sin cuentas que coincidan con los filtros.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--ds-border-soft)" }}>
            {filtered.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/finanzas/reportes/mayor/${a.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-ds-bg-2/40 transition-colors"
                >
                  <span
                    className="font-mono text-[11px] text-ds-text-3 w-20 shrink-0"
                  >
                    {a.code}
                  </span>
                  <span className="text-[12.5px] text-ds-text-1 flex-1 min-w-0 truncate">
                    {a.name}
                  </span>
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: TYPE_TONE[a.type],
                      background: `color-mix(in oklab, ${TYPE_TONE[a.type]} 12%, transparent)`,
                    }}
                  >
                    {TYPE_LABEL[a.type]}
                  </span>
                  <span className="text-[11.5px] text-ds-text-3 tabular-nums w-16 text-right shrink-0">
                    {a.movementsCount}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-ds-text-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
