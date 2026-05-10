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
import { fmt, SectionHeader, SubtotalRow } from "./MatrixHelpers";
import { ExpandableMatrixRow } from "./ExpandableMatrixRow";
import { BucketBankDrawer } from "./BucketBankDrawer";

interface Props {
  initialProjection: ProjectionMatrix;
  defaultWeeks: number;
  canManage: boolean;
}

export function WeeklyMatrix({ initialProjection, defaultWeeks, canManage }: Props) {
  const [weeks, setWeeks] = useState<number>(defaultWeeks);
  // initialProjection llega serializado vía JSON.parse(JSON.stringify(...)) desde
  // el Server Component, así que `start`/`end` son strings. Rehidratamos en el
  // lazy initializer para que las filas del tfoot (`b.start.getTime()`) y
  // cualquier otro consumidor puedan usar métodos de Date sin crashear.
  const [projection, setProjection] = useState<ProjectionMatrix>(() => ({
    ...initialProjection,
    buckets: initialProjection.buckets.map((b) => ({
      ...b,
      start: new Date(b.start as unknown as string),
      end: new Date(b.end as unknown as string),
    })),
  }));
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerBucket, setDrawerBucket] = useState<string | null>(null);
  const todayDate = useMemo(() => new Date(), []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const toDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  }, [weeks]);

  useEffect(() => {
    if (weeks === defaultWeeks && refreshKey === 0) return;
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
  }, [weeks, defaultWeeks, today, toDate, refreshKey]);

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");

  const actualByCellKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of projection.buckets) {
      for (const occ of b.occurrences) {
        if (occ.actualAmountClp === null) continue;
        const cellKey = `${occ.categoryId ?? "_"}_${b.key}`;
        m.set(cellKey, (m.get(cellKey) ?? 0) + occ.actualAmountClp);
      }
    }
    return m;
  }, [projection]);

  const [matchResultMsg, setMatchResultMsg] = useState<string | null>(null);

  async function handleAutoMatch() {
    setMatching(true);
    setMatchResultMsg(null);
    try {
      const r = await fetch("/api/finance/cashflow/match/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: today, to: toDate }),
      });
      const j = await r.json();
      if (j?.success) {
        const total =
          (j.data.accountMatched ?? 0) + (j.data.heuristicMatched ?? 0);
        setMatchResultMsg(
          `Vinculadas ${total} ocurrencias · revisá los buckets para conciliar las restantes.`,
        );
        // Refrescar la matriz pero sin perder el mensaje.
        setRefreshKey((k) => k + 1);
      } else {
        setMatchResultMsg(j?.error ?? "Error en auto-match");
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
                <ExpandableMatrixRow
                  key={r.categoryCode}
                  row={r}
                  actualByCellKey={actualByCellKey}
                  buckets={projection.buckets}
                  granularity="weekly"
                  onActionDone={() => setRefreshKey((k) => k + 1)}
                />
              ))}
              <SubtotalRow label="Total ingresos" rows={incomeRows} buckets={projection.buckets} tone="ok" />

              <SectionHeader label="Egresos" colSpan={colCount} tone="warn" />
              {expenseRows.map((r) => (
                <ExpandableMatrixRow
                  key={r.categoryCode}
                  row={r}
                  actualByCellKey={actualByCellKey}
                  buckets={projection.buckets}
                  granularity="weekly"
                  onActionDone={() => setRefreshKey((k) => k + 1)}
                />
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

              {/* Real banco — solo buckets con start ≤ hoy. Las semanas futuras
                  no tienen datos de banco todavía y se muestran como —. */}
              <tr className="bg-status-ok-soft/30">
                <td className="sticky left-0 z-40 bg-status-ok-soft/30 p-2 whitespace-nowrap text-status-ok-fg text-[12px]">
                  Real banco (ingresos)
                </td>
                {projection.buckets.map((b) => {
                  const isPast = b.start.getTime() <= todayDate.getTime();
                  return (
                    <td
                      key={b.key}
                      className="p-2 text-right font-mono whitespace-nowrap text-status-ok-fg text-[12px]"
                    >
                      {isPast ? (
                        <button
                          type="button"
                          onClick={() => setDrawerBucket(b.key)}
                          className="hover:underline"
                          title="Ver movimientos del bucket"
                        >
                          {b.actualBankIncome > 0 ? fmt.format(b.actualBankIncome) : "—"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-status-ok-soft/30 whitespace-nowrap text-status-ok-fg text-[12px]">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankIncome ?? 0), 0),
                  )}
                </td>
              </tr>

              <tr className="bg-status-warn-soft/30">
                <td className="sticky left-0 z-40 bg-status-warn-soft/30 p-2 whitespace-nowrap text-status-warn-fg text-[12px]">
                  Real banco (egresos)
                </td>
                {projection.buckets.map((b) => {
                  const isPast = b.start.getTime() <= todayDate.getTime();
                  return (
                    <td
                      key={b.key}
                      className="p-2 text-right font-mono whitespace-nowrap text-status-warn-fg text-[12px]"
                    >
                      {isPast ? (
                        <button
                          type="button"
                          onClick={() => setDrawerBucket(b.key)}
                          className="hover:underline"
                          title="Ver movimientos del bucket"
                        >
                          {b.actualBankExpense > 0 ? fmt.format(b.actualBankExpense) : "—"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-status-warn-soft/30 whitespace-nowrap text-status-warn-fg text-[12px]">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankExpense ?? 0), 0),
                  )}
                </td>
              </tr>

              <tr className="bg-status-info-soft/30 border-b border-border">
                <td
                  className="sticky left-0 z-40 bg-status-info-soft/30 p-2 whitespace-nowrap text-status-info-fg text-[12px]"
                  title="Δ vs proyectado: (real ingresos − proyectado) − (real egresos − proyectado). Positivo = real mejor que proyectado; negativo = peor."
                >
                  Δ vs proyectado
                </td>
                {projection.buckets.map((b) => {
                  const isPast = b.start.getTime() <= todayDate.getTime();
                  if (!isPast) {
                    return (
                      <td
                        key={b.key}
                        className="p-2 text-right font-mono whitespace-nowrap text-ds-text-4 text-[12px]"
                      >
                        —
                      </td>
                    );
                  }
                  const tone =
                    Math.abs(b.bankVarianceClp) < 50_000
                      ? "text-ds-text-3"
                      : b.bankVarianceClp > 0
                        ? "text-status-ok-fg"
                        : "text-status-warn-fg";
                  return (
                    <td
                      key={b.key}
                      className={`p-2 text-right font-mono whitespace-nowrap text-[12px] ${tone}`}
                    >
                      {b.bankVarianceClp > 0 ? "+" : ""}
                      {fmt.format(b.bankVarianceClp)}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-status-info-soft/30 whitespace-nowrap text-status-info-fg text-[12px]">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.bankVarianceClp ?? 0), 0),
                  )}
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
      {matchResultMsg && (
        <p className="text-[12px] text-ds-text-2 mt-2">{matchResultMsg}</p>
      )}

      <BucketBankDrawer
        open={drawerBucket !== null}
        onOpenChange={(o) => {
          if (!o) setDrawerBucket(null);
        }}
        bucketKey={drawerBucket}
        granularity="weekly"
      />
    </Surface>
  );
}
