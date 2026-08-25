"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, Moon, Sun } from "lucide-react";
import {
  EmptyState,
  FilterChipsBar,
  PageHero,
  SegmentedControl,
  Spinner,
  Stat,
  StatGrid,
  Tag,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsTouchLayout } from "@/hooks/useIsTouchLayout";
import {
  SHIFT_STORAGE_KEY,
  buildGrillaView,
  formatChileTime,
  parseShiftFilter,
  sortGrillaRows,
  type ChileYmd,
  type GrillaCellView,
  type GrillaPayload,
  type GrillaSortMode,
  type KpiFilter,
  type QualityKind,
  type ShiftFilter,
} from "@/lib/supervision-grilla";
import { SupervisionDayPanel } from "./SupervisionDayPanel";
import { SupervisionFindingsPanel } from "./SupervisionFindingsPanel";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES = ["D", "L", "M", "X", "J", "V", "S"];

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay();
}

function qualityRing(q: QualityKind): string {
  if (q === "geofence") return "ring-2 ring-status-danger";
  if (q === "no_checkout" || q === "short") return "ring-2 ring-status-warn";
  return "";
}

function VisitChip({ cell }: { cell: GrillaCellView }) {
  const ring = qualityRing(cell.quality);
  const nightPip = cell.visits.some((v) => v.shift === "night") && cell.chip !== "day";
  const label =
    cell.chip === "day" || cell.chip === "night" ? cell.initials : String(cell.count);

  if (cell.chip === "mixed") {
    return (
      <span
        className={`relative inline-flex h-7 min-w-[28px] items-center justify-center overflow-hidden rounded-md px-1 text-[12px] font-semibold ${ring}`}
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-status-ok-soft" />
        <span className="absolute inset-y-0 right-0 w-1/2 bg-tint-violet" />
        <span className="relative z-10 flex items-center gap-0.5 text-ds-text-1">
          {cell.count}
          <span className="h-1.5 w-1.5 rounded-full bg-tint-violet-fg" />
        </span>
      </span>
    );
  }

  const tone =
    cell.chip === "day"
      ? "bg-status-ok-soft text-status-ok-fg"
      : cell.chip === "night"
        ? "bg-tint-violet text-tint-violet-fg"
        : "bg-status-info-soft text-status-info-fg";

  return (
    <span
      className={`inline-flex h-7 min-w-[28px] items-center justify-center gap-0.5 rounded-md px-1 text-[12px] font-semibold ${tone} ${ring}`}
    >
      {label}
      {nightPip && cell.chip === "multi" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-tint-violet-fg" />
      ) : null}
    </span>
  );
}

function EmptyMark({ kind }: { kind: GrillaCellView["empty"] }) {
  if (kind === "missed") {
    return (
      <span
        className="inline-block h-5 w-5 rounded-sm border border-dashed border-status-warn-border bg-status-warn-soft"
        title="Asignación sin ejecución"
      />
    );
  }
  if (kind === "idle") {
    return <span className="text-ds-text-4">·</span>;
  }
  return <span className="text-ds-text-4">–</span>;
}

function CellTooltip({
  cell,
  date,
  anchorRect,
}: {
  cell: GrillaCellView;
  date: string;
  anchorRect: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const tt = ref.current.getBoundingClientRect();
    let top = anchorRect.top - tt.height - 6;
    let left = anchorRect.left + anchorRect.width / 2 - tt.width / 2;
    if (top < 4) top = anchorRect.bottom + 6;
    if (left < 4) left = 4;
    if (left + tt.width > window.innerWidth - 4) {
      left = window.innerWidth - tt.width - 4;
    }
    setPos({ top, left });
  }, [anchorRect]);

  return (
    <div
      ref={ref}
      className="fixed z-50 max-w-xs rounded-md border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[12px] text-ds-text-1 shadow-md"
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="font-medium">{date}</p>
      {cell.visits.length === 0 && cell.incidents.length === 0 && cell.empty === "missed" && (
        <p className="text-status-warn-fg">Asignación sin ejecución</p>
      )}
      {cell.visits.map((v) => (
        <div key={v.id} className="mt-1.5 border-t border-ds-border-subtle pt-1.5">
          <p className="font-medium">{v.supervisorName}</p>
          <p className="text-ds-text-3">
            {formatChileTime(v.checkInAt)} → {v.checkOutAt ? formatChileTime(v.checkOutAt) : "Sin salida"}
            {" · "}
            {v.durationLabel}
          </p>
          <p className="text-ds-text-3">
            {v.shift === "night" ? "Noche" : "Día"}
            {v.crossedShift ? " · Cruzó turno" : ""}
            {v.outsideGeofence ? " · Fuera de geocerca" : ""}
            {v.shortVisit ? " · Corta" : ""}
          </p>
        </div>
      ))}
      {cell.incidents.length > 0 && (
        <div className="mt-1.5 border-t border-ds-border-subtle pt-1.5">
          <p className="font-medium text-status-danger-fg">
            {cell.incidents.length} incidente{cell.incidents.length === 1 ? "" : "s"}
          </p>
          {cell.incidents.map((inc) => (
            <p key={inc.id} className="text-ds-text-3">
              {inc.code} · {inc.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SupervisionGrilla({
  year: initialYear,
  month: initialMonth,
}: {
  year: number;
  month: number;
}) {
  const touch = useIsTouchLayout();
  const [data, setData] = useState<GrillaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [shift, setShift] = useState<ShiftFilter>("both");
  const [shiftReady, setShiftReady] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("none");
  const [sortMode, setSortMode] = useState<GrillaSortMode>("az");
  const [tooltip, setTooltip] = useState<{
    cell: GrillaCellView;
    date: string;
    rect: DOMRect;
  } | null>(null);
  const [dayPanel, setDayPanel] = useState<{
    installationId: string;
    name: string;
    year: number;
    month: number;
    day: number;
  } | null>(null);
  const [findingsPanel, setFindingsPanel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    setShift(parseShiftFilter(window.localStorage.getItem(SHIFT_STORAGE_KEY)));
    setShiftReady(true);
  }, []);

  useEffect(() => {
    if (!shiftReady) return;
    window.localStorage.setItem(SHIFT_STORAGE_KEY, shift);
  }, [shift, shiftReady]);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/supervision/grilla?year=${y}&month=${m}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json.data);
      } else {
        setError(json.error ?? "Error cargando grilla");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(year, month);
  }, [year, month, fetchData]);

  function goPrev() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function toggleKpi(next: KpiFilter) {
    setKpiFilter((cur) => (cur === next ? "none" : next));
  }

  const view = useMemo(
    () => (data ? buildGrillaView(data, shift, kpiFilter) : null),
    [data, shift, kpiFilter],
  );
  const rows = useMemo(
    () => (view ? sortGrillaRows(view.rows, sortMode) : []),
    [view, sortMode],
  );
  const days = data ? Array.from({ length: data.daysInMonth }, (_, i) => i + 1) : [];
  const today: ChileYmd | null = data?.today ?? null;
  const isCurrentMonth = today != null && year === today.year && month === today.month;

  const kpiChip =
    kpiFilter === "por_validar"
      ? { key: "kpi", label: "Por validar", onClear: () => setKpiFilter("none") }
      : kpiFilter === "sin_noche"
        ? { key: "kpi", label: "Sin noche", onClear: () => setKpiFilter("none") }
        : kpiFilter === "calidad"
          ? { key: "kpi", label: "Cortas / sin salida", onClear: () => setKpiFilter("none") }
          : kpiFilter === "incidentes"
            ? { key: "kpi", label: "Con incidentes", onClear: () => setKpiFilter("none") }
            : null;

  return (
    <div className="ds-page-enter space-y-4 min-w-0">
      <PageHero
        icon={<ClipboardCheck />}
        iconTone="emerald"
        title="Incidentes en terreno"
        subtitle="grilla de supervisión"
        description="La visita es el check-in del supervisor. Hall. son hallazgos abiertos de esa instalación. El punto rojo es un incidente reportado en el sitio. No son lo mismo."
      />

      {view && (
        <StatGrid cols={2} lgCols={4}>
          <Stat
            label="Por validar"
            value={view.kpis.porValidar}
            hint="Incidentes cerrados, pendientes de supervisión"
            variant={kpiFilter === "por_validar" ? "warn" : "default"}
            onClick={() => toggleKpi("por_validar")}
          />
          <Stat
            label="Sin noche"
            value={view.kpis.sinNoche}
            hint="Sitios que exigen visita nocturna y no la tienen"
            variant={kpiFilter === "sin_noche" ? "brand" : "default"}
            onClick={() => toggleKpi("sin_noche")}
          />
          <Stat
            label="Cortas / sin salida"
            value={view.kpis.calidad}
            hint="Visitas de menos de 20 min o sin check-out"
            variant={kpiFilter === "calidad" ? "warn" : "default"}
            onClick={() => toggleKpi("calidad")}
          />
          <Stat
            label="Con incidentes"
            value={view.kpis.conIncidentes}
            hint="Sitios con incidentes abiertos o en curso"
            variant={kpiFilter === "incidentes" ? "danger" : "default"}
            onClick={() => toggleKpi("incidentes")}
          />
        </StatGrid>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-8 sm:w-8"
            onClick={goPrev}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-8 sm:w-8"
            onClick={goNext}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<ShiftFilter>
            ariaLabel="Turno"
            value={shift}
            onChange={setShift}
            items={[
              { id: "day", label: "Día", icon: Sun },
              { id: "night", label: "Noche", icon: Moon },
              { id: "both", label: "Ambas" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ["az", "A-Z"],
                ["vis_desc", "↓ Vis"],
                ["vis_asc", "↑ Vis"],
                ["hrs", "↓ Hrs"],
                ["inc", "↓ Inc"],
                ["cobertura", "Cobertura"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                variant={sortMode === id ? "default" : "outline"}
                size="sm"
                className="h-11 px-2.5 text-[12px] sm:h-8"
                onClick={() => setSortMode(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <FilterChipsBar chips={kpiChip ? [kpiChip] : []} />
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error && !data ? (
        <EmptyState
          icon={ClipboardCheck}
          tone="warn"
          title="No se pudo cargar la grilla"
          description={error}
          action={
            <Button type="button" onClick={() => void fetchData(year, month)}>
              Reintentar
            </Button>
          }
        />
      ) : data && rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={kpiFilter !== "none" ? "Nada con este filtro" : "No hay instalaciones asignadas"}
          description={
            kpiFilter !== "none"
              ? "Quita el KPI activo o cambia Día / Noche / Ambas."
              : "Asigna instalaciones a un supervisor para verlas aquí."
          }
        />
      ) : data && view ? (
        <div className="relative overflow-x-auto rounded-md border border-ds-border-default">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ds-surface-1/60">
              <Spinner />
            </div>
          )}
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-ds-border-subtle bg-ds-surface-2">
                <th className="sticky left-0 z-20 min-w-[150px] bg-ds-surface-2 px-3 py-2 text-left font-medium">
                  Instalación
                </th>
                {days.map((d) => {
                  const dow = getDayOfWeek(year, month, d);
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = isCurrentMonth && d === today?.day;
                  return (
                    <th
                      key={d}
                      className={`min-w-[36px] px-0.5 py-1 text-center font-normal ${
                        isWeekend ? "text-ds-text-4" : ""
                      }`}
                    >
                      <div
                        className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[12px] leading-tight ${
                          isToday ? "bg-primary text-primary-foreground font-semibold" : ""
                        }`}
                      >
                        <span>{DAY_NAMES[dow]}</span>
                        <span className="font-medium">{d}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="min-w-[44px] px-2 py-2 text-center font-medium" title="Hallazgos abiertos">
                  Hall.
                </th>
                <th className="min-w-[44px] px-2 py-2 text-center font-medium" title="Incidentes abiertos o en curso del mes">
                  Inc.
                </th>
                <th className="min-w-[44px] px-2 py-2 text-center font-medium" title="Visitas del mes, con el filtro de turno">
                  Vis.
                </th>
                <th className="min-w-[48px] px-2 py-2 text-center font-medium" title="Horas en sitio del mes">
                  Hrs.
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.installation.id}
                  className={`border-b border-ds-border-subtle transition-colors hover:bg-ds-surface-2 ${
                    idx % 2 === 0 ? "" : "bg-ds-surface-2/40"
                  }`}
                >
                  <td className="sticky left-0 z-10 bg-ds-surface-1 px-3 py-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="line-clamp-1" title={row.installation.name}>
                        {row.installation.name}
                      </span>
                      {row.installation.nocturnoEnabled && (
                        <span
                          title={row.missingNight ? "Sin visita nocturna este mes" : "Exige visita nocturna"}
                        >
                          <Moon
                            className={`h-3.5 w-3.5 shrink-0 ${
                              row.missingNight ? "text-status-warn-fg" : "text-tint-violet-fg"
                            }`}
                          />
                        </span>
                      )}
                    </span>
                  </td>
                  {days.map((d) => {
                    const cell = row.cells[d];
                    const dow = getDayOfWeek(year, month, d);
                    const isWeekend = dow === 0 || dow === 6;
                    const clickable = cell.count > 0 || cell.hasIncident || cell.empty === "missed";
                    const dateLabel = `${d} ${MONTH_NAMES[month - 1]}`;
                    return (
                      <td
                        key={d}
                        className={`relative px-0.5 py-1 text-center ${isWeekend ? "bg-ds-surface-2/50" : ""}`}
                        onMouseEnter={(e) => {
                          if (touch || !clickable) return;
                          setTooltip({
                            cell,
                            date: dateLabel,
                            rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <button
                          type="button"
                          disabled={!clickable}
                          className="inline-flex h-9 w-9 items-center justify-center disabled:pointer-events-none"
                          onClick={() => {
                            setTooltip(null);
                            setDayPanel({
                              installationId: row.installation.id,
                              name: row.installation.name,
                              year,
                              month,
                              day: d,
                            });
                          }}
                          aria-label={`${row.installation.name}, día ${d}`}
                        >
                          {cell.count > 0 ? <VisitChip cell={cell} /> : <EmptyMark kind={cell.empty} />}
                        </button>
                        {cell.hasIncident && (
                          <span
                            className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-status-danger"
                            title="Incidente"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    {row.installation.openFindings > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFindingsPanel({
                            id: row.installation.id,
                            name: row.installation.name,
                          })
                        }
                        className="inline-flex min-h-11 min-w-11 items-center justify-center"
                        title={`Ver ${row.installation.openFindings} hallazgo${row.installation.openFindings > 1 ? "s" : ""}`}
                      >
                        <Tag variant="danger" size="sm">
                          {row.installation.openFindings}
                        </Tag>
                      </button>
                    ) : (
                      <span className="text-ds-text-4">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.openIncidents > 0 ? (
                      <Tag variant="danger" size="sm">{row.openIncidents}</Tag>
                    ) : (
                      <span className="text-ds-text-4">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center font-medium text-ds-text-2 tabular-nums">
                    {row.totalVisits}
                  </td>
                  <td className="px-2 py-1.5 text-center font-medium text-ds-text-2 tabular-nums">
                    {row.hoursLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tooltip && (
        <CellTooltip cell={tooltip.cell} date={tooltip.date} anchorRect={tooltip.rect} />
      )}

      <SupervisionDayPanel
        target={dayPanel}
        shift={shift}
        onClose={() => setDayPanel(null)}
        onChanged={() => void fetchData(year, month)}
      />
      <SupervisionFindingsPanel
        installation={findingsPanel}
        onClose={() => setFindingsPanel(null)}
        onChanged={() => void fetchData(year, month)}
      />

      <div className="flex flex-wrap items-center gap-4 text-[12px] text-ds-text-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-status-ok-soft text-[12px] font-semibold text-status-ok-fg">
            AB
          </span>
          1 visita diurna
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-tint-violet text-[12px] font-semibold text-tint-violet-fg">
            AB
          </span>
          1 visita nocturna
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-status-info-soft text-[12px] font-semibold text-status-info-fg">
            3
          </span>
          Varias del mismo turno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-status-danger" />
          Incidente del día
        </span>
        <span className="flex items-center gap-1.5">
          <Tag variant="danger" size="sm">2</Tag>
          Hallazgos abiertos (no son incidentes)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-sm border border-dashed border-status-warn-border bg-status-warn-soft" />
          Asignación sin ejecución
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-ds-text-4">·</span>
          Sin visita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-ds-text-4">–</span>
          No había que ir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-status-ok-soft ring-2 ring-status-warn text-[12px] font-semibold text-status-ok-fg">
            AB
          </span>
          Corta o sin salida
        </span>
      </div>
    </div>
  );
}
