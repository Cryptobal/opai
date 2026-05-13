"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { fmt, SectionHeader, SubtotalRow, driftTone, DRIFT_TONE_CLASS } from "./MatrixHelpers";
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

interface IpcPendingMarker {
  id: string;
  dueDate: string;
}

export function WeeklyMatrix({ initialProjection, defaultWeeks, canManage }: Props) {
  const [weeks, setWeeks] = useState<number>(defaultWeeks);
  // Semanas hacia ATRÁS desde hoy. 0 = solo futuro. Default 2 para que
  // siempre se vean las 2 últimas semanas + actual (donde caen los movs
  // y ajustes shortfall recién conciliados).
  // El server-side ya hidrata la proyección con weeksBack=2; el override
  // local se re-fetchea cuando el usuario cambia este valor.
  const [weeksBack, setWeeksBack] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerBucket, setDrawerBucket] = useState<string | null>(null);
  const todayDate = useMemo(() => new Date(), []);
  // Ajustes IPC PENDING — mostramos un highlight ámbar en la celda
  // (semana × item) donde cae cada `dueDate` para que el reajuste de
  // contratos en CLP no se pase de fecha. Mismo patrón que MonthlyMatrix.
  const [ipcPending, setIpcPending] = useState<
    Map<string, IpcPendingMarker[]>
  >(new Map());

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
    if (weeks !== defaultWeeks || weeksBack > 0) {
      setRefreshKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queremos correr solo
    // cuando llega una proyección nueva del server; `weeks`/`weeksBack` y
    // `defaultWeeks` se capturan al ejecutar.
  }, [hydratedInitial]);

  const projection: ProjectionMatrix = override ?? hydratedInitial;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fromDate = useMemo(() => {
    if (weeksBack === 0) return today;
    const d = new Date();
    d.setDate(d.getDate() - weeksBack * 7);
    return d.toISOString().slice(0, 10);
  }, [weeksBack, today]);
  const toDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  }, [weeks]);

  useEffect(() => {
    if (weeks === defaultWeeks && weeksBack === 0 && refreshKey === 0) return;
    setLoading(true);
    fetch(`/api/finance/cashflow/projection?from=${fromDate}&to=${toDate}&granularity=weekly`)
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
  }, [weeks, defaultWeeks, fromDate, toDate, refreshKey, weeksBack]);

  const incomeRows = projection.rows.filter((r) => r.kind === "INCOME");
  const expenseRows = projection.rows.filter((r) => r.kind === "EXPENSE");

  // Carga los ajustes IPC pendientes y los indexa por `${itemId}_${bucketKey}`.
  // En weekly, el bucket.key tiene formato `YYYY-Www` o `WK-YYYYMMDD` según
  // la config del tenant, así que en vez de duplicar la lógica de bucketKeyFor
  // buscamos el bucket por rango de fecha de la dueDate.
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
          const due = new Date(a.dueDate);
          if (Number.isNaN(due.getTime())) continue;
          const bucket = projection.buckets.find(
            (b) => due >= b.start && due <= b.end,
          );
          if (!bucket) continue;
          const key = `${a.itemId}_${bucket.key}`;
          const list = m.get(key) ?? [];
          list.push({ id: a.id, dueDate: a.dueDate });
          m.set(key, list);
        }
        setIpcPending(m);
      })
      .catch(() => {
        // Highlight informativo: si falla, la matriz funciona igual.
      });
  }, [refreshKey, projection.buckets]);

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

  // Footer colapsable: en móvil las 5 filas sticky-bottom (Neto, Real banco
  // ing/eg, Δ, Saldo) ocupan demasiado vertical en landscape. Por default
  // colapsamos las 4 intermedias y dejamos solo "Saldo acumulado" — el
  // valor más importante. Desktop: expandido. localStorage mantiene la pref.
  const [footerExpanded, setFooterExpanded] = useState(true);
  // Secciones Ingresos / Egresos colapsables (chevron en el header). Cuando
  // están colapsadas se ve solo el "Total ingresos" / "Total egresos" como
  // resumen, sin las filas de categorías individuales.
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
          <Select value={String(weeksBack)} onValueChange={(v) => setWeeksBack(Number(v))}>
            <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[150px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 4, 8, 13, 26, 52].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w === 0 ? "Solo futuro" : `+ ${w} sem. atrás`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                          ? "bg-status-info-soft text-status-info-fg border-x-2 border-x-status-info-fg ring-1 ring-status-info-fg/40"
                          : "bg-background text-ds-text-3 border-border"
                      } ${showMonth && !isCurrent ? "border-l border-l-border" : ""}`}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">
                          {isCurrent ? "Hoy" : showMonth ? monthYearShort(b.start) : "·"}
                        </span>
                        <span className={isCurrent ? "font-bold" : ""}>
                          {b.label}
                        </span>
                        <span className="text-[10px] opacity-60">
                          Lun {b.start.getDate()}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right min-w-[100px] border-b border-l border-border bg-card whitespace-nowrap">
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
                    granularity="weekly"
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
                    granularity="weekly"
                    onActionDone={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              <SubtotalRow label="Total egresos" rows={expenseRows} buckets={projection.buckets} tone="warn" />
            </tbody>
            {/* tfoot sticky bottom: las filas Neto / Real / Δ / Saldo quedan
                fijas al hacer scroll vertical. Cada <td> debe tener fondo
                opaco (no semitransparente con /30) para que el tbody no se
                transparente por debajo. Las stickies left/right ya usan
                bg-card; las celdas del medio usan bg-background o bg-muted
                según el tono. */}
            <tfoot className="sticky bottom-0 z-30">
              {footerExpanded && (
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
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
                  {fmt.format(projection.totals.totalNet)}
                </td>
              </tr>
              )}

              {/* Real banco — solo buckets con start ≤ hoy. Las semanas futuras
                  no tienen datos de banco todavía y se muestran como —. */}
              {footerExpanded && (
              <tr className="bg-background">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-status-ok-fg text-[12px] border-r border-border/50">
                  Real banco (ingresos)
                </td>
                {projection.buckets.map((b) => {
                  const isPast = b.start.getTime() <= todayDate.getTime();
                  return (
                    <td
                      key={b.key}
                      className="p-2 text-right font-mono whitespace-nowrap text-status-ok-fg text-[12px] bg-background"
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
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-ok-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankIncome ?? 0), 0),
                  )}
                </td>
              </tr>
              )}

              {footerExpanded && (
              <tr className="bg-background">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-status-warn-fg text-[12px] border-r border-border/50">
                  Real banco (egresos)
                </td>
                {projection.buckets.map((b) => {
                  const isPast = b.start.getTime() <= todayDate.getTime();
                  return (
                    <td
                      key={b.key}
                      className="p-2 text-right font-mono whitespace-nowrap text-status-warn-fg text-[12px] bg-background"
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
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-warn-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.actualBankExpense ?? 0), 0),
                  )}
                </td>
              </tr>
              )}

              {footerExpanded && (
              <tr className="bg-background border-b border-border">
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
                        className="p-2 text-right font-mono whitespace-nowrap text-ds-text-4 text-[12px] bg-background"
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
                      className={`p-2 text-right font-mono whitespace-nowrap text-[12px] bg-background ${tone}`}
                    >
                      {b.bankVarianceClp > 0 ? "+" : ""}
                      {fmt.format(b.bankVarianceClp)}
                    </td>
                  );
                })}
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap text-status-info-fg text-[12px] border-l border-border/50">
                  {fmt.format(
                    projection.buckets.reduce((s, b) => s + (b.bankVarianceClp ?? 0), 0),
                  )}
                </td>
              </tr>
              )}

              {/* Saldo acumulado: SIEMPRE visible. La celda sticky-left tiene
                  el toggle para mostrar/ocultar las 4 filas de arriba. */}
              <tr className="bg-muted font-semibold">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap border-r border-border/50">
                  <button
                    type="button"
                    onClick={toggleFooter}
                    className="flex items-center gap-1.5 w-full text-left"
                    title={footerExpanded ? "Ocultar detalles (Neto/Real/Δ)" : "Mostrar detalles"}
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
                    className={`p-2 text-right font-mono whitespace-nowrap bg-muted ${
                      c.balanceClp >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"
                    }`}
                  >
                    {fmt.format(c.balanceClp)}
                  </td>
                ))}
                <td className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">—</td>
              </tr>

              {/* Saldo banco real acumulado — SIEMPRE visible. Buckets
                  futuros muestran "—". */}
              <tr className="bg-card border-t border-border/40">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-[12px] text-ds-text-2 border-r border-border/50">
                  Saldo banco real
                </td>
                {projection.cumulativePoints.map((p) => (
                  <td
                    key={p.bucketKey}
                    className={`p-2 text-right font-mono whitespace-nowrap text-[12px] bg-card ${
                      p.realBankClp === null
                        ? "text-ds-text-4"
                        : p.realBankClp >= 0
                          ? "text-status-ok-fg"
                          : "text-status-warn-fg"
                    }`}
                  >
                    {p.realBankClp === null ? "—" : fmt.format(p.realBankClp)}
                  </td>
                ))}
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
