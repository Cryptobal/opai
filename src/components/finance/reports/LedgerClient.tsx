"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LedgerAccountListItem } from "@/modules/finance/reports/shared/types";
import { Surface, Toolbar, Tag, type TagVariant } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Patrimonio",
  REVENUE: "Ingreso",
  COST: "Costo",
  EXPENSE: "Gasto",
};

const TYPE_VARIANT: Record<string, TagVariant> = {
  ASSET: "ok",
  LIABILITY: "warn",
  EQUITY: "info",
  REVENUE: "ok",
  COST: "danger",
  EXPENSE: "warn",
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
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar cuenta por código o nombre..."
        controls={
          <label className="inline-flex items-center gap-2 text-xs text-ds-text-3 whitespace-nowrap">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Ocultar sin movimientos
          </label>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter(null)}
          className={cn(
            "h-8 px-3 rounded-ds-md text-xs border transition-colors",
            !typeFilter
              ? "bg-ds-surface-2 text-ds-text-1 border-ds-border-strong"
              : "bg-ds-surface text-ds-text-3 border-ds-border-default hover:bg-ds-surface-2"
          )}
        >
          Todas
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            className={cn(
              "h-8 px-3 rounded-ds-md text-xs border transition-colors",
              typeFilter === t
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-ds-surface text-ds-text-3 border-ds-border-default hover:bg-ds-surface-2"
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <Surface padding="none" elevation={1} className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-ds-text-3">
            Sin cuentas que coincidan con los filtros.
          </p>
        ) : (
          <ul className="divide-y divide-ds-border-subtle">
            {filtered.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/finanzas/reportes/mayor/${a.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-ds-surface-2/50 transition-colors"
                >
                  <span className="font-mono text-xs text-ds-text-3 w-20 shrink-0">
                    {a.code}
                  </span>
                  <span className="text-sm text-ds-text-1 flex-1 min-w-0 truncate">
                    {a.name}
                  </span>
                  <Tag variant={TYPE_VARIANT[a.type] ?? "neutral"} className="shrink-0">
                    {TYPE_LABEL[a.type]}
                  </Tag>
                  <span className="text-xs text-ds-text-3 ds-num w-16 text-right shrink-0">
                    {a.movementsCount} mov.
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-ds-text-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
