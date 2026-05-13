"use client";
import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectionRow } from "@/modules/finance/cashflow/types";
import { fmt } from "./MatrixHelpers";
import { CategoryGroup } from "./CashflowMobileItemRow";
import type { DrawerItemTarget } from "./CashflowItemDrawer";

interface Props {
  title: string;
  tone: "ok" | "warn";
  storageKey: string;
  rows: ProjectionRow[];
  bucketKey: string;
  emptyText: string;
  canManage: boolean;
  onOpenItem: (t: DrawerItemTarget) => void;
}

export function CashflowMobileSection({
  title,
  tone,
  storageKey,
  rows,
  bucketKey,
  emptyText,
  canManage,
  onOpenItem,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(storageKey);
    if (v !== null) setExpanded(v === "1");
  }, [storageKey]);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Solo categorías con monto > 0 en el bucket activo o que tengan ítems
  // con movimiento. Evita ruido de categorías que no aplican.
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const v = r.values.find((x) => x.bucketKey === bucketKey);
      if (v && v.amount > 0) return true;
      return r.items.some((it) =>
        it.values.some(
          (iv) =>
            iv.bucketKey === bucketKey &&
            (iv.amount > 0 || iv.occurrenceId !== null),
        ),
      );
    });
  }, [rows, bucketKey]);

  const subtotal = useMemo(
    () =>
      visibleRows.reduce((s, r) => {
        const v = r.values.find((x) => x.bucketKey === bucketKey);
        return s + (v?.amount ?? 0);
      }, 0),
    [visibleRows, bucketKey],
  );

  const toneHeader =
    tone === "ok"
      ? "bg-status-ok-soft text-status-ok-fg"
      : "bg-status-warn-soft text-status-warn-fg";

  return (
    <div className="rounded-ds-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 ${toneHeader}`}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span className="text-[12px] font-mono uppercase tracking-wider">
            {title}
          </span>
        </span>
        <span className="text-[13px] font-mono font-semibold tabular-nums">
          {fmt.format(subtotal)}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-border/60">
          {visibleRows.length === 0 ? (
            <p className="text-[12px] text-ds-text-3 p-3 text-center">
              {emptyText}
            </p>
          ) : (
            visibleRows.map((row) => (
              <CategoryGroup
                key={row.categoryCode}
                row={row}
                bucketKey={bucketKey}
                kind={row.kind as "INCOME" | "EXPENSE"}
                canManage={canManage}
                onOpenItem={onOpenItem}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
