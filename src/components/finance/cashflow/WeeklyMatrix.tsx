"use client";
import { useState, useEffect, useMemo } from "react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { fmt, MatrixRow, SectionHeader, SubtotalRow } from "./MatrixHelpers";

interface Props {
  initialProjection: ProjectionMatrix;
  defaultWeeks: number;
  canManage: boolean;
}

export function WeeklyMatrix({ initialProjection, defaultWeeks, canManage }: Props) {
  const [weeks, setWeeks] = useState<number>(defaultWeeks);
  const [projection, setProjection] = useState<ProjectionMatrix>(initialProjection);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const toDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  }, [weeks]);

  useEffect(() => {
    if (weeks === defaultWeeks) return;
    setLoading(true);
    fetch(`/api/finance/cashflow/projection?from=${today}&to=${toDate}&granularity=weekly`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data) {
          const p = j.data as ProjectionMatrix;
          p.buckets = p.buckets.map((b) => ({
            ...b,
            start: new Date(b.start),
            end: new Date(b.end),
          }));
          setProjection(p);
        }
      })
      .finally(() => setLoading(false));
  }, [weeks, defaultWeeks, today, toDate]);

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");

  async function handleAutoMatch() {
    setMatching(true);
    try {
      const r = await fetch("/api/finance/cashflow/match/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: today, to: toDate }),
      });
      const j = await r.json();
      if (j?.success) {
        window.location.reload();
      }
    } finally {
      setMatching(false);
    }
  }

  const colCount = projection.buckets.length + 2;

  return (
    <Surface elevation={1} padding="md" className="overflow-hidden">
      {/* Header: stack on mobile, inline on desktop. Selector + actions are
          full-width on mobile to maximize tap area. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <p className="text-[12px] sm:text-[13px] text-ds-text-2">
          {projection.buckets.length} semanas · saldo inicial {fmt.format(projection.openingBalanceClp)}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[140px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 13, 26, 52, 78, 104].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} semanas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoMatch}
              disabled={matching}
              className="h-10 sm:h-9 w-full sm:w-auto"
            >
              {matching ? "Vinculando..." : "Auto-match con cartola"}
            </Button>
          )}
        </div>
      </div>

      {/* Scroll container: bleed full-width on mobile (-mx-4 px-4), max-h
          for vertical scrolling so bottom totals can stay sticky.
          relative + overflow-auto is what enables sticky positioning. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative overflow-auto max-h-[70vh] rounded-ds-md border border-border">
          <table className="text-[11px] sm:text-[12px] w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-background">
              <tr>
                <th className="sticky left-0 z-40 bg-background text-left p-2 min-w-[140px] sm:min-w-[180px] border-b border-border">
                  Categoría
                </th>
                {projection.buckets.map((b) => (
                  <th
                    key={b.key}
                    className="p-2 text-right min-w-[80px] border-b border-border whitespace-nowrap text-ds-text-3 font-mono bg-background"
                  >
                    {b.label}
                  </th>
                ))}
                <th className="sticky right-0 z-40 p-2 text-right min-w-[100px] border-b border-border bg-muted/40 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionHeader label="Ingresos" colSpan={colCount} tone="ok" />
              {incomeRows.map((r) => (
                <MatrixRow key={r.categoryCode} row={r} />
              ))}
              <SubtotalRow label="Total ingresos" rows={incomeRows} buckets={projection.buckets} tone="ok" />

              <SectionHeader label="Egresos" colSpan={colCount} tone="warn" />
              {expenseRows.map((r) => (
                <MatrixRow key={r.categoryCode} row={r} />
              ))}
              <SubtotalRow label="Total egresos" rows={expenseRows} buckets={projection.buckets} tone="warn" />
            </tbody>
            <tfoot className="sticky bottom-0 z-30">
              <tr className="border-t-2 border-border font-semibold bg-background">
                <td className="sticky left-0 z-40 bg-background p-2 whitespace-nowrap">Neto semanal</td>
                {projection.buckets.map((b) => (
                  <td
                    key={b.key}
                    className={`p-2 text-right font-mono whitespace-nowrap bg-background ${
                      b.net >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                    }`}
                  >
                    {fmt.format(b.net)}
                  </td>
                ))}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-muted/40 whitespace-nowrap">
                  {fmt.format(projection.totals.totalNet)}
                </td>
              </tr>

              <tr className="bg-muted/60 font-semibold">
                <td className="sticky left-0 z-40 bg-muted/60 p-2 whitespace-nowrap">Saldo acumulado</td>
                {projection.cumulativeBalances.map((c) => (
                  <td
                    key={c.bucketKey}
                    className={`p-2 text-right font-mono whitespace-nowrap bg-muted/60 ${
                      c.balanceClp >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                    }`}
                  >
                    {fmt.format(c.balanceClp)}
                  </td>
                ))}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-muted/60 whitespace-nowrap">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {loading && <p className="text-[12px] text-ds-text-3 mt-2">Recalculando...</p>}
    </Surface>
  );
}
