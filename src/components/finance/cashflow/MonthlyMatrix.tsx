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
  }, [fromDate, toDate]);

  if (loading || !projection) {
    return (
      <Surface elevation={1} padding="md">
        <p className="text-[13px] text-ds-text-2">Cargando proyección mensual...</p>
      </Surface>
    );
  }

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");

  return (
    <Surface elevation={1} padding="md" className="overflow-hidden">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-[13px] text-ds-text-2">
          {projection.buckets.length} meses · saldo inicial {fmt.format(projection.openingBalanceClp)}
        </p>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
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

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="text-[11px] w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background text-left p-2 min-w-[180px] border-b border-border">
                Categoría
              </th>
              {projection.buckets.map((b) => (
                <th
                  key={b.key}
                  className="p-2 text-right min-w-[90px] border-b border-border whitespace-nowrap text-ds-text-3 font-mono"
                >
                  {b.label}
                </th>
              ))}
              <th className="p-2 text-right min-w-[100px] border-b border-border bg-muted/20">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader label="Ingresos" colSpan={projection.buckets.length + 2} tone="ok" />
            {incomeRows.map((r) => (
              <MatrixRow key={r.categoryCode} row={r} />
            ))}
            <SubtotalRow label="Total ingresos" rows={incomeRows} buckets={projection.buckets} tone="ok" />

            <SectionHeader label="Egresos" colSpan={projection.buckets.length + 2} tone="warn" />
            {expenseRows.map((r) => (
              <MatrixRow key={r.categoryCode} row={r} />
            ))}
            <SubtotalRow label="Total egresos" rows={expenseRows} buckets={projection.buckets} tone="warn" />

            <tr className="border-t border-border font-semibold">
              <td className="sticky left-0 z-10 bg-background p-2">Neto mensual</td>
              {projection.buckets.map((b) => (
                <td
                  key={b.key}
                  className={`p-2 text-right font-mono ${
                    b.net >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                  }`}
                >
                  {fmt.format(b.net)}
                </td>
              ))}
              <td className="p-2 text-right font-mono bg-muted/20">
                {fmt.format(projection.totals.totalNet)}
              </td>
            </tr>

            <tr className="bg-muted/40 font-semibold">
              <td className="sticky left-0 z-10 bg-muted/40 p-2">Saldo acumulado</td>
              {projection.cumulativeBalances.map((c) => (
                <td
                  key={c.bucketKey}
                  className={`p-2 text-right font-mono ${
                    c.balanceClp >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                  }`}
                >
                  {fmt.format(c.balanceClp)}
                </td>
              ))}
              <td className="p-2 text-right font-mono bg-muted/40">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
