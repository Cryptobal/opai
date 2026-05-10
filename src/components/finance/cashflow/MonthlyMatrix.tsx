"use client";
import { useState, useEffect, useMemo } from "react";
import { Surface } from "@/components/opai-ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { fmt, MatrixRow, SectionHeader, SubtotalRow } from "./MatrixHelpers";
import { addMonths } from "date-fns";

interface Props {
  defaultMonths: number;
  canManage: boolean;
}

export function MonthlyMatrix({ defaultMonths }: Props) {
  const [months, setMonths] = useState<number>(defaultMonths);
  const [projection, setProjection] = useState<ProjectionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fromDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const toDate = useMemo(
    () => addMonths(new Date(), months).toISOString().slice(0, 10),
    [months],
  );

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finance/cashflow/projection?from=${fromDate}&to=${toDate}&granularity=monthly`)
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
  }, [fromDate, toDate, refreshKey]);

  // useMemo DEBE ir antes de cualquier early return para respetar Rules of Hooks.
  // El primer render con projection=null y los siguientes con projection≠null
  // tienen que llamar la misma cantidad de hooks (React error #310 en prod).
  const actualByCellKey = useMemo(() => {
    const m = new Map<string, number>();
    if (!projection) return m;
    for (const b of projection.buckets) {
      for (const occ of b.occurrences) {
        if (occ.actualAmountClp === null) continue;
        const cellKey = `${occ.categoryId ?? "_"}_${b.key}`;
        m.set(cellKey, (m.get(cellKey) ?? 0) + occ.actualAmountClp);
      }
    }
    return m;
  }, [projection]);

  if (loading || !projection) {
    return (
      <Surface elevation={1} padding="md">
        <p className="text-[13px] text-ds-text-2">Cargando proyección mensual...</p>
      </Surface>
    );
  }

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");
  const colCount = projection.buckets.length + 2;

  return (
    <Surface elevation={1} padding="md" className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <p className="text-[12px] sm:text-[13px] text-ds-text-2">
          {projection.buckets.length} meses · saldo inicial {fmt.format(projection.openingBalanceClp)}
        </p>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[140px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[3, 6, 12, 18, 24, 36, 60].map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} meses
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                    className="p-2 text-right min-w-[90px] border-b border-border whitespace-nowrap text-ds-text-3 font-mono bg-background"
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
                <MatrixRow key={r.categoryCode} row={r} actualByCellKey={actualByCellKey} buckets={projection.buckets} granularity="monthly" onActionDone={() => setRefreshKey((k) => k + 1)} />
              ))}
              <SubtotalRow label="Total ingresos" rows={incomeRows} buckets={projection.buckets} tone="ok" />

              <SectionHeader label="Egresos" colSpan={colCount} tone="warn" />
              {expenseRows.map((r) => (
                <MatrixRow key={r.categoryCode} row={r} actualByCellKey={actualByCellKey} buckets={projection.buckets} granularity="monthly" onActionDone={() => setRefreshKey((k) => k + 1)} />
              ))}
              <SubtotalRow label="Total egresos" rows={expenseRows} buckets={projection.buckets} tone="warn" />
            </tbody>
            <tfoot className="sticky bottom-0 z-30">
              <tr className="border-t-2 border-border font-semibold bg-background">
                <td className="sticky left-0 z-40 bg-background p-2 whitespace-nowrap">Neto mensual</td>
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
    </Surface>
  );
}
