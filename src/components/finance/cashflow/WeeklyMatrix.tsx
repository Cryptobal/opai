"use client";
import { useState, useEffect, useMemo, useRef } from "react";
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

const MONTH_LABEL_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * Etiqueta breve de mes para el header del bucket: "may '26".
 * Se muestra debajo de "Sem N" para que el usuario sepa de un vistazo
 * a qué mes pertenece cada columna sin tener que contar semanas.
 */
function monthYearShort(d: Date): string {
  return `${MONTH_LABEL_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

interface Props {
  initialProjection: ProjectionMatrix;
  defaultWeeks: number;
  canManage: boolean;
}

export function WeeklyMatrix({ initialProjection, defaultWeeks, canManage }: Props) {
  const [weeks, setWeeks] = useState<number>(defaultWeeks);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerBucket, setDrawerBucket] = useState<string | null>(null);
  const todayDate = useMemo(() => new Date(), []);

  // Auto-scroll horizontal: queremos que la semana actual quede como la
  // 3ra columna visible. Permite ver 2 semanas pasadas como contexto y el
  // resto futuras (lo que el usuario consulta más a menudo).
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentBucketKey = useRef<string | null>(null);
  const hasAutoScrolled = useRef(false);

  // initialProjection llega serializado vía JSON.parse(JSON.stringify(...)) desde
  // el Server Component, así que `start`/`end` son strings. Rehidratamos en una
  // memo derivada — cuando el Server Component re-renderiza por router.refresh(),
  // initialProjection es un objeto nuevo y la memo se recalcula, exponiendo la
  // proyección fresca a la UI sin overrides locales.
  const hydratedInitial = useMemo<ProjectionMatrix>(
    () => ({
      ...initialProjection,
      buckets: initialProjection.buckets.map((b) => ({
        ...b,
        start: new Date(b.start as unknown as string),
        end: new Date(b.end as unknown as string),
      })),
    }),
    [initialProjection],
  );

  // override es null cuando estamos mostrando hydratedInitial; pasa a tener
  // valor cuando el usuario cambia el rango o cuando refreshKey > 0 dispara
  // un re-fetch (auto-match, etc).
  const [override, setOverride] = useState<ProjectionMatrix | null>(null);

  // Cada vez que el server envía una proyección nueva (creación de quick item,
  // move/amount, etc → router.refresh()), descartamos el override para mostrar
  // la fresca. Si el usuario tenía un rango distinto al default, disparamos un
  // re-fetch para mantener su selección.
  useEffect(() => {
    setOverride(null);
    if (weeks !== defaultWeeks) {
      setRefreshKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queremos correr solo
    // cuando llega una proyección nueva del server; `weeks` y `defaultWeeks` se
    // capturan al ejecutar.
  }, [hydratedInitial]);

  const projection: ProjectionMatrix = override ?? hydratedInitial;

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
          setOverride(p);
        }
      })
      .finally(() => setLoading(false));
  }, [weeks, defaultWeeks, today, toDate, refreshKey]);

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");

  // Índice del bucket que contiene hoy. Si hoy queda fuera del rango
  // (caso raro: range start > hoy), idx queda en -1 y no auto-scrolleamos.
  const currentBucketIdx = useMemo(() => {
    const t = todayDate.getTime();
    return projection.buckets.findIndex(
      (b) => b.start.getTime() <= t && t <= b.end.getTime(),
    );
  }, [projection.buckets, todayDate]);

  if (currentBucketIdx !== -1) {
    currentBucketKey.current = projection.buckets[currentBucketIdx].key;
  }

  // Auto-scroll a la 3ra columna (offsetIdx=2). Se ejecuta una sola vez al
  // montar / cuando llega projection inicial. Si el usuario hace scroll
  // manual después, no lo molestamos.
  useEffect(() => {
    if (hasAutoScrolled.current) return;
    if (currentBucketIdx < 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const table = container.querySelector("table");
    if (!table) return;
    // El thead tiene: [Categoría, ...buckets, Total]. Bucket en posición
    // (currentBucketIdx + 1) en el `<tr>` (la 1ra <th> es Categoría).
    const headers = table.querySelectorAll("thead th");
    const targetCol = headers[currentBucketIdx + 1] as HTMLElement | undefined;
    const categoryCol = headers[0] as HTMLElement | undefined;
    if (!targetCol || !categoryCol) return;
    // Posición deseada: la columna actual debe quedar después de 2
    // columnas visibles (sin contar la columna sticky "Categoría").
    const colWidth = targetCol.offsetWidth;
    const desiredLeft =
      targetCol.offsetLeft - categoryCol.offsetWidth - colWidth * 2;
    container.scrollTo({ left: Math.max(0, desiredLeft), behavior: "auto" });
    hasAutoScrolled.current = true;
  }, [currentBucketIdx, projection.buckets.length]);

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
        <div
          ref={scrollContainerRef}
          className="relative overflow-auto max-h-[70vh] rounded-ds-md border border-border"
        >
          <table className="text-[11px] sm:text-[12px] w-full border-collapse">
            {/* <colgroup> permite pintar toda la columna de la semana actual
                con un fondo de acento. Las celdas sticky-left/right tienen
                su propio bg, así no se ven afectadas. */}
            <colgroup>
              <col />
              {projection.buckets.map((b) => (
                <col
                  key={b.key}
                  className={
                    b.key === currentBucketKey.current
                      ? "bg-status-info-soft/15"
                      : undefined
                  }
                />
              ))}
              <col />
            </colgroup>
            <thead className="sticky top-0 z-30 bg-background">
              <tr>
                <th className="sticky left-0 z-40 bg-background text-left p-2 min-w-[140px] sm:min-w-[180px] border-b border-border">
                  Categoría
                </th>
                {projection.buckets.map((b, idx) => {
                  const isCurrent = b.key === currentBucketKey.current;
                  const prevBucket = idx > 0 ? projection.buckets[idx - 1] : null;
                  // Mostrar el mes solo cuando cambia respecto al bucket
                  // anterior (evita repetir "may '26" cuatro veces). En el
                  // primer bucket siempre.
                  const showMonth =
                    !prevBucket ||
                    prevBucket.start.getMonth() !== b.start.getMonth() ||
                    prevBucket.start.getFullYear() !== b.start.getFullYear();
                  return (
                    <th
                      key={b.key}
                      className={`p-2 text-right min-w-[80px] border-b whitespace-nowrap font-mono ${
                        isCurrent
                          ? "bg-status-info-soft/40 text-status-info-fg border-status-info-fg/30"
                          : "bg-background text-ds-text-3 border-border"
                      } ${showMonth ? "border-l border-l-border" : ""}`}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">
                          {showMonth ? monthYearShort(b.start) : "·"}
                        </span>
                        <span className={isCurrent ? "font-bold" : ""}>
                          {b.label}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-40 p-2 text-right min-w-[100px] border-b border-l border-border bg-card whitespace-nowrap">
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
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap border-r border-border/50">Neto semanal</td>
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
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
                  {fmt.format(projection.totals.totalNet)}
                </td>
              </tr>

              {/* Real banco — solo buckets con start ≤ hoy. Las semanas futuras
                  no tienen datos de banco todavía y se muestran como —. */}
              <tr className="bg-status-ok-soft/30">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-status-ok-fg text-[12px] border-r border-border/50">
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
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-ok-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankIncome ?? 0), 0),
                  )}
                </td>
              </tr>

              <tr className="bg-status-warn-soft/30">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-status-warn-fg text-[12px] border-r border-border/50">
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
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-warn-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankExpense ?? 0), 0),
                  )}
                </td>
              </tr>

              <tr className="bg-status-info-soft/30 border-b border-border">
                <td
                  className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-status-info-fg text-[12px] border-r border-border/50"
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
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-info-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.bankVarianceClp ?? 0), 0),
                  )}
                </td>
              </tr>

              <tr className="bg-muted font-semibold">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap border-r border-border/50">Saldo acumulado</td>
                {projection.cumulativeBalances.map((c) => (
                  <td
                    key={c.bucketKey}
                    className={`p-2 text-right font-mono whitespace-nowrap bg-muted ${
                      c.balanceClp >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                    }`}
                  >
                    {fmt.format(c.balanceClp)}
                  </td>
                ))}
                <td className="sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">—</td>
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
