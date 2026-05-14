"use client";
import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import {
  fmt,
  SectionHeader,
  SubtotalRow,
  driftTone,
  DRIFT_TONE_CLASS,
  loadRowOrder,
  saveRowOrder,
  sortRowsForDisplay,
  type RowOrder,
} from "./MatrixHelpers";
import { ExpandableMatrixRow } from "./ExpandableMatrixRow";
import { BankBalanceAdjustDrawer } from "./BankBalanceAdjustDrawer";
import { useHasCapability } from "@/lib/permissions-context";
import { addMonths } from "date-fns";

interface Props {
  defaultMonths: number;
  canManage: boolean;
}

interface IpcPendingMarker {
  id: string;
  dueDate: string;
}

export function MonthlyMatrix({ defaultMonths }: Props) {
  const [months, setMonths] = useState<number>(defaultMonths);
  const [projection, setProjection] = useState<ProjectionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bankAdjustOpen, setBankAdjustOpen] = useState(false);
  const [rowOrder, setRowOrder] = useState<RowOrder>("default");
  const canEditBalance = useHasCapability("banking_manage");

  useEffect(() => {
    setRowOrder(loadRowOrder());
  }, []);
  // Ajustes IPC PENDING — mostramos un highlight en la celda (mes × item)
  // donde cae cada `dueDate` para que el reajuste no se pase de fecha.
  const [ipcPending, setIpcPending] = useState<
    Map<string, IpcPendingMarker[]>
  >(new Map());

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

  // Carga los ajustes IPC pendientes. Clave del Map: `${itemId}_${YYYY-MM}`
  // — replica el formato de `bucketKeyFor` para monthly.
  useEffect(() => {
    fetch("/api/finance/cashflow/ipc-adjustments?status=PENDING")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success || !Array.isArray(j.data)) return;
        const m = new Map<string, IpcPendingMarker[]>();
        for (const a of j.data as Array<{
          id: string;
          itemId: string;
          dueDate: string;
        }>) {
          const d = new Date(a.dueDate);
          if (Number.isNaN(d.getTime())) continue;
          // Replicamos el formato de `bucketKeyFor(date, "monthly")` que
          // usa fecha local (date-fns getYear/getMonth, no UTC). Si
          // diverge, las celdas no matchean en zonas horarias UTC≠0.
          const bucketKey = `${d.getFullYear()}-${String(
            d.getMonth() + 1,
          ).padStart(2, "0")}`;
          const key = `${a.itemId}_${bucketKey}`;
          const list = m.get(key) ?? [];
          list.push({ id: a.id, dueDate: a.dueDate });
          m.set(key, list);
        }
        setIpcPending(m);
      })
      .catch(() => {
        // El highlight es informativo — si falla, la matriz funciona igual.
      });
  }, [refreshKey]);

  // Footer colapsable (mismo patrón que WeeklyMatrix). En móvil ocultamos
  // "Neto mensual" por default y dejamos solo "Saldo acumulado".
  // Secciones Ingresos/Egresos también colapsables (resumen-only).
  const [footerExpanded, setFooterExpanded] = useState(true);
  const [ingresosExpanded, setIngresosExpanded] = useState(true);
  const [egresosExpanded, setEgresosExpanded] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedFooter = window.localStorage.getItem("cashflow.footer.expanded");
    if (savedFooter !== null) {
      setFooterExpanded(savedFooter === "1");
    } else {
      setFooterExpanded(window.innerWidth >= 640);
    }
    const savedIng = window.localStorage.getItem("cashflow.ingresos.expanded");
    if (savedIng !== null) setIngresosExpanded(savedIng === "1");
    const savedEgr = window.localStorage.getItem("cashflow.egresos.expanded");
    if (savedEgr !== null) setEgresosExpanded(savedEgr === "1");
  }, []);
  function toggleFooter() {
    setFooterExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "cashflow.footer.expanded",
          next ? "1" : "0",
        );
      } catch {}
      return next;
    });
  }
  function toggleIngresos() {
    setIngresosExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("cashflow.ingresos.expanded", next ? "1" : "0");
      } catch {}
      return next;
    });
  }
  function toggleEgresos() {
    setEgresosExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("cashflow.egresos.expanded", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

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

  // Bucket que contiene hoy. Sirve para habilitar el tap en la celda de
  // "Saldo banco real" del mes en curso.
  const currentBucketKey = useMemo<string | null>(() => {
    if (!projection) return null;
    const t = Date.now();
    const found = projection.buckets.find(
      (b) => b.start.getTime() <= t && t <= b.end.getTime(),
    );
    return found?.key ?? null;
  }, [projection]);

  if (loading || !projection) {
    return (
      <Surface elevation={1} padding="md">
        <p className="text-[13px] text-ds-text-2">Cargando proyección mensual...</p>
      </Surface>
    );
  }

  const incomeRows = sortRowsForDisplay(
    projection.rows.filter((r) => r.kind === "INCOME"),
    rowOrder,
  );
  const expenseRows = sortRowsForDisplay(
    projection.rows.filter((r) => r.kind === "EXPENSE"),
    rowOrder,
  );
  const colCount = projection.buckets.length + 2;

  return (
    <Surface elevation={1} padding="md" className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <p className="text-[12px] sm:text-[13px] text-ds-text-2">
          {projection.buckets.length} meses · saldo inicial {fmt.format(projection.openingBalanceClp)}
        </p>
        <div className="flex gap-2">
          <Select
            value={rowOrder}
            onValueChange={(v) => {
              const next = v as RowOrder;
              setRowOrder(next);
              saveRowOrder(next);
            }}
          >
            <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[170px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Orden por defecto</SelectItem>
              <SelectItem value="alpha">Alfabético</SelectItem>
              <SelectItem value="amount_desc">Mayor monto</SelectItem>
            </SelectContent>
          </Select>
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
      </div>

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative overflow-auto max-h-[70vh] rounded-ds-md border border-border">
          <table className="text-[11px] sm:text-[12px] w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-background">
              <tr>
                <th className="sticky left-0 z-40 bg-background text-left p-2 min-w-[140px] max-w-[200px] sm:min-w-[180px] sm:max-w-[260px] border-b border-border">
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
                <th className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right min-w-[100px] border-b border-border bg-muted/40 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionHeader
                label="Ingresos"
                colSpan={colCount}
                tone="ok"
                expanded={ingresosExpanded}
                onToggle={toggleIngresos}
              />
              {ingresosExpanded &&
                incomeRows.map((r) => (
                  <ExpandableMatrixRow
                    key={r.categoryCode}
                    row={r}
                    actualByCellKey={actualByCellKey}
                    ipcPending={ipcPending}
                    buckets={projection.buckets}
                    granularity="monthly"
                    rowOrder={rowOrder}
                    onActionDone={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              <SubtotalRow label="Total ingresos" rows={incomeRows} buckets={projection.buckets} tone="ok" />

              <SectionHeader
                label="Egresos"
                colSpan={colCount}
                tone="warn"
                expanded={egresosExpanded}
                onToggle={toggleEgresos}
              />
              {egresosExpanded &&
                expenseRows.map((r) => (
                  <ExpandableMatrixRow
                    key={r.categoryCode}
                    row={r}
                    actualByCellKey={actualByCellKey}
                    ipcPending={ipcPending}
                    buckets={projection.buckets}
                    granularity="monthly"
                    rowOrder={rowOrder}
                    onActionDone={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              <SubtotalRow label="Total egresos" rows={expenseRows} buckets={projection.buckets} tone="warn" />
            </tbody>
            <tfoot className="sticky bottom-0 z-30">
              {footerExpanded && (
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
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-muted/40 whitespace-nowrap">
                  {fmt.format(projection.totals.totalNet)}
                </td>
              </tr>
              )}

              <tr className="bg-muted/60 font-semibold">
                <td className="sticky left-0 z-40 bg-muted/60 p-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={toggleFooter}
                    className="flex items-center gap-1.5 w-full text-left"
                    title={footerExpanded ? "Ocultar Neto mensual" : "Mostrar Neto mensual"}
                    aria-expanded={footerExpanded}
                  >
                    {footerExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
                    )}
                    <span>Saldo acumulado</span>
                  </button>
                </td>
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
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-muted/60 whitespace-nowrap">—</td>
              </tr>

              {/* Saldo banco real acumulado — SIEMPRE visible. La celda del
                  bucket actual es tappable para abrir el drawer de ajuste
                  manual cuando el usuario tiene banking_manage. */}
              <tr className="bg-card border-t border-border/40">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-[12px] text-ds-text-2 border-r border-border/50">
                  Saldo banco real
                </td>
                {projection.cumulativePoints.map((p) => {
                  const isCurrent = p.bucketKey === currentBucketKey;
                  const tone =
                    p.realBankClp === null
                      ? "text-ds-text-4"
                      : p.realBankClp >= 0
                        ? "text-status-ok-fg"
                        : "text-status-warn-fg";
                  const content =
                    p.realBankClp === null ? "—" : fmt.format(p.realBankClp);
                  return (
                    <td
                      key={p.bucketKey}
                      className={`p-2 text-right font-mono whitespace-nowrap text-[12px] bg-card ${tone}`}
                    >
                      {isCurrent && canEditBalance ? (
                        <button
                          type="button"
                          onClick={() => setBankAdjustOpen(true)}
                          className="inline-flex items-center gap-1 hover:underline underline-offset-2 decoration-dotted cursor-pointer"
                          title="Ajustar saldo del banco"
                        >
                          <Pencil className="h-3 w-3 opacity-70" aria-hidden="true" />
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">—</td>
              </tr>

              {/* Δ banco vs proyectado — drift acumulado por bucket. */}
              <tr className="bg-card border-t border-border/40">
                <td
                  className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-[12px] text-ds-text-2 border-r border-border/50"
                  title="Δ acumulado: saldo banco real − saldo proyectado. 0 = cuadrado."
                >
                  Δ banco vs proyectado
                </td>
                {projection.cumulativePoints.map((p) => {
                  const tone = driftTone(p.cumulativeBankVarianceClp);
                  return (
                    <td
                      key={p.bucketKey}
                      className={`p-2 text-right font-mono whitespace-nowrap text-[12px] bg-card ${DRIFT_TONE_CLASS[tone]}`}
                    >
                      {p.cumulativeBankVarianceClp === null
                        ? "—"
                        : `${p.cumulativeBankVarianceClp > 0 ? "+" : ""}${fmt.format(p.cumulativeBankVarianceClp)}`}
                    </td>
                  );
                })}
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <BankBalanceAdjustDrawer
        open={bankAdjustOpen}
        onClose={() => setBankAdjustOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </Surface>
  );
}
