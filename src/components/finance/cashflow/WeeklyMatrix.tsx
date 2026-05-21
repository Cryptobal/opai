"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Lock, MoreHorizontal, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { BucketBankDrawer } from "./BucketBankDrawer";
import { WeekCloseDrawer } from "./week-close/WeekCloseDrawer";
import { CashflowLegend } from "./CashflowLegend";
import { filterRowBySearch } from "./cashflow-search";
import { useHasCapability } from "@/lib/permissions-context";

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
  /** Texto del buscador (Bloque 6 Fase 4). Filtra filas por categoría,
   *  nombre de item, nickname, cliente CRM e instalación. Vive en
   *  CashflowTabs para preservarse entre weekly/monthly. */
  searchTerm?: string;
}

interface IpcPendingMarker {
  id: string;
  dueDate: string;
}

export function WeeklyMatrix({
  initialProjection,
  defaultWeeks,
  canManage,
  searchTerm = "",
}: Props) {
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
  const [weekCloseOpen, setWeekCloseOpen] = useState(false);
  const [rowOrder, setRowOrder] = useState<RowOrder>("default");
  const canEditBalance = useHasCapability("banking_manage");

  useEffect(() => {
    setRowOrder(loadRowOrder());
  }, []);
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

  // Bloque 6 Fase 4: filtra rows por searchTerm contra categoría, nombre
  // de item, nickname, cliente CRM e instalación. filterRowBySearch además
  // recorta los `items` dentro de cada row para que solo se rendericen
  // los que matchean (ej. buscar "el bosque" muestra solo ese contrato
  // dentro de Polpaico, no los 4). Si term es vacío, pasan todas las
  // filas sin recortes.
  const incomeRows = sortRowsForDisplay(
    projection.rows
      .filter((r) => r.kind === "INCOME")
      .map((r) => filterRowBySearch(r, searchTerm))
      .filter((r): r is NonNullable<typeof r> => r !== null),
    rowOrder,
  );
  const expenseRows = sortRowsForDisplay(
    projection.rows
      .filter((r) => r.kind === "EXPENSE")
      .map((r) => filterRowBySearch(r, searchTerm))
      .filter((r): r is NonNullable<typeof r> => r !== null),
    rowOrder,
  );
  const hasSearchActive = searchTerm.trim().length > 0;
  const noResults =
    hasSearchActive && incomeRows.length === 0 && expenseRows.length === 0;

  // Carga los ajustes IPC pendientes y los indexa por `${itemId}_${bucketKey}`.
  // En weekly, el bucket.key tiene formato `YYYY-Www` o `WK-YYYYMMDD` según
  // la config del tenant, así que en vez de duplicar la lógica de bucketKeyFor
  // buscamos el bucket por rango de fecha de la dueDate.
  useEffect(() => {
    const lastBucket = projection.buckets[projection.buckets.length - 1];
    const projectUntil = lastBucket
      ? lastBucket.end.toISOString().slice(0, 10)
      : "";
    const url = projectUntil
      ? `/api/finance/cashflow/ipc-adjustments?status=PENDING&projectUntil=${projectUntil}`
      : "/api/finance/cashflow/ipc-adjustments?status=PENDING";

    // Index de items por id para encontrar la primera cuota con monto
    // >= dueDate. Si el bucket del dueDate cae en una semana SIN cuota
    // del item (ej. día de pago = 5 pero dueDate = 13), movemos el badge
    // a la primera cuota futura del mismo item — así el ámbar siempre
    // pinta una celda con monto.
    const itemById = new Map<
      string,
      { bucketKey: string; scheduledDate: Date; amount: number }[]
    >();
    for (const row of projection.rows) {
      for (const it of row.items) {
        itemById.set(
          it.itemId,
          it.values.map((v) => ({
            bucketKey: v.bucketKey,
            scheduledDate: new Date(v.scheduledDate),
            amount: v.amount,
          })),
        );
      }
    }

    fetch(url)
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
          // Primera cuota del item con scheduledDate >= due y monto > 0
          const values = itemById.get(a.itemId);
          let targetBucketKey: string | null = null;
          if (values) {
            const candidate = values
              .filter((v) => v.amount > 0 && v.scheduledDate >= due)
              .sort(
                (x, y) =>
                  x.scheduledDate.getTime() - y.scheduledDate.getTime(),
              )[0];
            if (candidate) targetBucketKey = candidate.bucketKey;
          }
          // Fallback: bucket que contiene la dueDate (caso item sin cuotas
          // futuras visibles — el badge cae donde se programó originalmente).
          if (!targetBucketKey) {
            const bucket = projection.buckets.find(
              (b) => due >= b.start && due <= b.end,
            );
            if (!bucket) continue;
            targetBucketKey = bucket.key;
          }
          const key = `${a.itemId}_${targetBucketKey}`;
          const list = m.get(key) ?? [];
          list.push({ id: a.id, dueDate: a.dueDate });
          m.set(key, list);
        }
        setIpcPending(m);
      })
      .catch(() => {
        // Highlight informativo: si falla, la matriz funciona igual.
      });
  }, [refreshKey, projection.buckets, projection.rows]);

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

  // Vista resumen: los 3 estados están colapsados → solo se ven Total ingresos,
  // Total egresos y Saldo acumulado. Cualquier otra combinación = vista detalle.
  const isSummaryView = !ingresosExpanded && !egresosExpanded && !footerExpanded;

  function toggleViewMode() {
    // Si está en resumen, abrir todo. Si está en cualquier otro estado, colapsar todo.
    const next = isSummaryView; // true = expandir, false = colapsar
    setIngresosExpanded(next);
    setEgresosExpanded(next);
    setFooterExpanded(next);
    try {
      window.localStorage.setItem("cashflow.ingresos.expanded", next ? "1" : "0");
      window.localStorage.setItem("cashflow.egresos.expanded", next ? "1" : "0");
      window.localStorage.setItem("cashflow.footer.expanded", next ? "1" : "0");
    } catch {}
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
          <div className="flex items-center gap-1 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = weeksBack === 0 ? 4 : weeksBack <= 4 ? 8 : weeksBack <= 8 ? 13 : weeksBack <= 13 ? 26 : 52;
                setWeeksBack(next);
              }}
              disabled={weeksBack >= 52}
              className="h-9 sm:h-8 w-9 sm:w-8 shrink-0 p-0"
              title="Retroceder 1 preset (más semanas hacia atrás)"
              aria-label="Retroceder semanas"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Select value={String(weeksBack)} onValueChange={(v) => setWeeksBack(Number(v))}>
              <SelectTrigger className="h-9 sm:h-8 flex-1 sm:w-[140px] text-[12px]">
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = weeksBack === 52 ? 26 : weeksBack > 26 ? 26 : weeksBack > 13 ? 13 : weeksBack > 8 ? 8 : weeksBack > 4 ? 4 : 0;
                setWeeksBack(next);
              }}
              disabled={weeksBack === 0}
              className="h-9 sm:h-8 w-9 sm:w-8 shrink-0 p-0"
              title="Avanzar 1 preset (menos semanas hacia atrás)"
              aria-label="Avanzar semanas"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="h-9 sm:h-8 w-full sm:w-[130px] text-[12px]">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-9 sm:h-8 w-full sm:w-auto gap-1.5"
                aria-label="Más opciones"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[12px]">Más</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ds-text-3">
                Ordenar filas por
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setRowOrder("default");
                  saveRowOrder("default");
                }}
                className={rowOrder === "default" ? "font-semibold" : ""}
              >
                Orden por defecto
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRowOrder("alpha");
                  saveRowOrder("alpha");
                }}
                className={rowOrder === "alpha" ? "font-semibold" : ""}
              >
                Alfabético
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRowOrder("amount_desc");
                  saveRowOrder("amount_desc");
                }}
                className={rowOrder === "amount_desc" ? "font-semibold" : ""}
              >
                Mayor monto
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleViewMode}>
                {isSummaryView ? (
                  <>
                    <Eye className="h-3.5 w-3.5 mr-2" />
                    Vista detalle
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5 mr-2" />
                    Vista resumen
                  </>
                )}
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem onClick={handleAutoMatch} disabled={matching}>
                  {matching ? "Vinculando…" : "Auto-match con cartola"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <CashflowLegend className="hidden sm:inline-flex" />
        </div>
      </div>

      {noResults && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-8 w-8 text-ds-text-3 mb-3" />
          <p className="text-sm text-ds-text-2">
            No se encontraron filas con{" "}
            <strong>&ldquo;{searchTerm}&rdquo;</strong>
          </p>
          <p className="text-xs text-ds-text-3 mt-1">
            Probá con menos palabras o revisá la ortografía.
          </p>
        </div>
      )}

      {/* Banner del anchor activo. Permite al usuario entender por qué los
          buckets pre-anchor se ven atenuados y desde qué saldo parte la
          proyección hacia adelante. */}
      {projection.anchor && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-status-info-soft border border-status-info-border rounded-md text-[12px]">
          <Lock className="h-3.5 w-3.5 text-status-info-fg shrink-0" />
          <span className="text-status-info-fg">
            Proyección anclada a{" "}
            <strong>{fmt.format(projection.anchor.bankBalanceClp)}</strong> al
            cierre del{" "}
            {new Date(projection.anchor.weekEndDate).toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            .
          </span>
        </div>
      )}

      {/* Scroll container: bleed full-width on mobile (-mx-4 px-4), max-h
          for vertical scrolling so bottom totals can stay sticky.
          relative + overflow-auto is what enables sticky positioning. */}
      {!noResults && (
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
              {(() => {
                // Mismo agrupamiento que la fila de meses para que el
                // banding pinte columnas enteras alternando mes a mes.
                const colEls: React.ReactNode[] = [];
                let lastMonthKey: string | null = null;
                let bandCounter = -1;
                for (const b of projection.buckets) {
                  const monthKey = `${b.start.getUTCFullYear()}-${b.start.getUTCMonth()}`;
                  if (monthKey !== lastMonthKey) {
                    bandCounter += 1;
                    lastMonthKey = monthKey;
                  }
                  const isCurrent = b.key === currentBucketKey.current;
                  const bandIdx = bandCounter % 2;
                  colEls.push(
                    <col
                      key={b.key}
                      className={
                        isCurrent
                          ? "bg-status-info-soft/15"
                          : bandIdx === 0
                            ? "bg-ds-surface-2/15"
                            : "bg-ds-surface-3/10"
                      }
                    />,
                  );
                }
                return colEls;
              })()}
              <col />
            </colgroup>
            <thead className="sticky top-0 z-30 bg-background">
              {/* Fila 1: nombre del mes centrado sobre las semanas del mes */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 bg-background text-left p-2 min-w-[140px] max-w-[200px] sm:min-w-[180px] sm:max-w-[260px] border-b border-border align-bottom"
                >
                  Categoría
                </th>
                {(() => {
                  // Agrupar buckets por mes contiguo. Cada grupo emite un
                  // <th colSpan={N}> con el nombre del mes centrado.
                  const groups: {
                    monthKey: string;
                    label: string;
                    span: number;
                    isCurrent: boolean;
                    bandIdx: number; // 0 o 1 para alternancia
                  }[] = [];
                  let bandCounter = 0;
                  for (const b of projection.buckets) {
                    const monthKey = `${b.start.getUTCFullYear()}-${b.start.getUTCMonth()}`;
                    const last = groups[groups.length - 1];
                    if (last && last.monthKey === monthKey) {
                      last.span += 1;
                      if (b.key === currentBucketKey.current) last.isCurrent = true;
                    } else {
                      groups.push({
                        monthKey,
                        label: monthYearShort(b.start),
                        span: 1,
                        isCurrent: b.key === currentBucketKey.current,
                        bandIdx: bandCounter % 2,
                      });
                      bandCounter += 1;
                    }
                  }
                  return groups.map((g) => (
                    <th
                      key={g.monthKey}
                      colSpan={g.span}
                      className={`p-1.5 text-center font-mono text-[11px] uppercase tracking-wider whitespace-nowrap border-b ${
                        g.isCurrent
                          ? "bg-status-info-soft text-status-info-fg font-bold border-status-info-fg/40"
                          : g.bandIdx === 0
                            ? "bg-ds-surface-2/40 text-ds-text-2 border-border"
                            : "bg-ds-surface-3/30 text-ds-text-3 border-border"
                      }`}
                    >
                      {g.label}
                    </th>
                  ));
                })()}
                <th
                  rowSpan={2}
                  className="hidden sm:table-cell sticky right-0 z-40 p-2 text-right min-w-[100px] border-b border-l border-border bg-card whitespace-nowrap align-bottom"
                >
                  Total
                </th>
              </tr>
              {/* Fila 2: número de semana + día lunes */}
              <tr>
                {projection.buckets.map((b, idx) => {
                  const isCurrent = b.key === currentBucketKey.current;
                  const prevBucket = idx > 0 ? projection.buckets[idx - 1] : null;
                  const newMonth =
                    !prevBucket ||
                    prevBucket.start.getUTCMonth() !== b.start.getUTCMonth() ||
                    prevBucket.start.getUTCFullYear() !== b.start.getUTCFullYear();
                  const isPreAnchor =
                    projection.anchor !== null &&
                    b.end.getTime() <= new Date(projection.anchor.weekEndDate).getTime();
                  return (
                    <th
                      key={b.key}
                      className={`p-2 text-right min-w-[80px] border-b whitespace-nowrap font-mono ${
                        isCurrent
                          ? "bg-status-info-soft text-status-info-fg border-x-2 border-x-status-info-fg ring-1 ring-status-info-fg/40"
                          : isPreAnchor
                            ? "bg-background text-ds-text-3 border-border opacity-60"
                            : "bg-background text-ds-text-3 border-border"
                      } ${newMonth && !isCurrent && idx > 0 ? "border-l-2 border-l-ds-text-4/40" : ""}`}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span className={`inline-flex items-center gap-0.5 ${isCurrent ? "font-bold" : ""}`}>
                          {isPreAnchor && (
                            <Lock className="h-2.5 w-2.5 opacity-50" aria-label="Semana anclada al cierre" />
                          )}
                          {b.label}
                        </span>
                        <span className="text-[10px] opacity-60">
                          Lun {b.start.getDate()}
                        </span>
                      </div>
                    </th>
                  );
                })}
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
                    granularity="weekly"
                    rowOrder={rowOrder}
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
                  el toggle para mostrar/ocultar las 6 filas de arriba (Neto
                  semanal, Real banco ing/eg, Δ vs proyectado, Saldo banco
                  real, Δ banco vs proyectado). */}
              <tr className="bg-muted font-semibold">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap border-r border-border/50">
                  <button
                    type="button"
                    onClick={toggleFooter}
                    className="flex items-center gap-1.5 w-full text-left"
                    title={footerExpanded ? "Ocultar detalle (Neto, Real banco, Δ)" : "Mostrar detalle del flujo"}
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

              {/* Saldo banco real acumulado — parte del detalle del footer.
                  Buckets futuros muestran "—". La celda del bucket actual es
                  tappable para abrir el drawer de ajuste manual cuando
                  el usuario tiene banking_manage. */}
              {footerExpanded && (
              <tr className="bg-card border-t border-border/40">
                <td className="sticky left-0 z-40 bg-card p-2 whitespace-nowrap text-[12px] text-ds-text-2 border-r border-border/50">
                  Saldo banco real
                </td>
                {projection.cumulativePoints.map((p) => {
                  const isCurrent = p.bucketKey === currentBucketKey.current;
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
                          onClick={() => setWeekCloseOpen(true)}
                          className="inline-flex items-center gap-1 hover:underline underline-offset-2 decoration-dotted cursor-pointer"
                          title="Cerrar semana y anclar proyección"
                        >
                          <Lock className="h-3 w-3 opacity-70" aria-hidden="true" />
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
              )}

              {/* Δ banco vs proyectado — drift acumulado por bucket. */}
              {footerExpanded && (
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
              )}
            </tfoot>
          </table>
        </div>
      </div>
      )}
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

      <WeekCloseDrawer
        open={weekCloseOpen}
        onClose={() => setWeekCloseOpen(false)}
        onCommitted={() => setRefreshKey((k) => k + 1)}
        weekEndIso={
          currentBucketIdx >= 0
            ? projection.buckets[currentBucketIdx].end.toISOString()
            : new Date().toISOString()
        }
      />
    </Surface>
  );
}
