"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  MapPin,
  FileWarning,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RondaAuditMapModal } from "./RondaAuditMapModal";
import type { ReporteRow } from "./RondasReportesTable";

// ── Types ──

interface Installation {
  id: string;
  name: string;
}

interface EjecucionCell {
  id: string;
  status: string;
  guardiaName: string;
  startedAt: string | null;
  completedAt: string | null;
  completionPercent: number;
  trustScore: number;
  templateName: string | null;
  durationMinutes: number | null;
  incidentCount: number;
  alertCount: number;
  checkpointsCompletados: number;
  checkpointsTotal: number;
}

interface GridCell {
  slotKey: string;
  esperadas: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  alertCount: number;
  incidentCount: number;
  hasPanico: boolean;
  ejecuciones: EjecucionCell[];
}

interface DayRow {
  date: string;
  dayLabel: string;
  cells: GridCell[];
  totalEsperadas: number;
  totalCompletadas: number;
  totalAlerts: number;
  totalIncidents: number;
}

interface GridData {
  resumen: {
    totalRondas: number;
    completadas: number;
    incompletas: number;
    noRealizadas: number;
    cumplimiento: number;
    totalAlertas: number;
    alertasPanico: number;
    totalIncidentes: number;
    incidentesPendientes: number;
  };
  slots: Array<{ label: string; offsetMinutes: number }>;
  days: DayRow[];
  ciclo: string;
}

interface SelectedCell {
  date: string;
  slotKey: string;
  cell: GridCell;
}

interface Props {
  tenantId?: string;
  initialInstallationId?: string;
  initialDateFrom: string;
  initialDateTo: string;
  installations: Installation[];
}

// ── Date range presets ──

function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDatePresets(): Array<{ label: string; from: string; to: string }> {
  const now = new Date();
  const today = getLocalDateStr(now);

  // Última semana: 7 días atrás → hoy
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Últimos 14 días
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  // Mes en curso: 1ro del mes → hoy
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Mes anterior
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return [
    { label: "Última semana", from: getLocalDateStr(weekAgo), to: today },
    { label: "Últimos 14 días", from: getLocalDateStr(twoWeeksAgo), to: today },
    { label: "Mes en curso", from: getLocalDateStr(monthStart), to: today },
    { label: "Mes anterior", from: getLocalDateStr(prevMonthStart), to: getLocalDateStr(prevMonthEnd) },
  ];
}

type SortKey = "date" | "total";
type SortDir = "asc" | "desc";

// ── Helpers ──

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getCellColor(cell: GridCell): string {
  if (cell.esperadas === 0) return "bg-muted/5";
  if (cell.completadas === cell.esperadas) return "bg-status-ok-soft border border-status-ok-border";
  if (cell.completadas >= cell.esperadas * 0.7) return "bg-status-warn-soft border border-status-warn-border";
  if (cell.completadas > 0) return "bg-status-warn-soft border border-status-warn-border";
  return "bg-status-danger-soft border border-status-danger-border";
}

const STATUS_ICON_COLOR: Record<string, string> = {
  completada: "text-status-ok-fg",
  incompleta: "text-status-warn-fg",
  no_realizada: "text-status-danger-fg",
  pendiente: "text-zinc-500",
  en_curso: "text-status-info-fg",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completada: CheckCircle2,
  incompleta: AlertTriangle,
  no_realizada: XCircle,
  pendiente: Clock,
  en_curso: Loader2,
};

// ── Component ──

export function RondasReporteInstalacion({
  initialInstallationId,
  initialDateFrom,
  initialDateTo,
  installations,
}: Props) {
  const [installationId, setInstallationId] = useState(initialInstallationId ?? "");
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mapEjecucion, setMapEjecucion] = useState<EjecucionCell | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const datePresets = useMemo(() => getDatePresets(), []);

  const diffDays = useMemo(() => {
    if (!dateFrom || !dateTo) return 0;
    return Math.ceil(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24),
    );
  }, [dateFrom, dateTo]);

  const isRangeValid = diffDays > 0 && diffDays <= 30;

  const instOptions = useMemo(
    () => installations.map((i) => ({ id: i.id, label: i.name })),
    [installations],
  );

  const fetchGrid = useCallback(async () => {
    if (!installationId || !isRangeValid) return;
    setLoading(true);
    setSelectedCell(null);
    try {
      const params = new URLSearchParams({
        installationId,
        from: dateFrom,
        to: dateTo,
      });
      const res = await fetch(`/api/ops/rondas/reportes/instalacion-detalle?${params}`);
      const json = await res.json();
      if (json.success) {
        setGridData(json.data);
      } else {
        toast.error(json.error ?? "Error cargando reporte");
      }
    } catch {
      toast.error("Error cargando reporte");
    } finally {
      setLoading(false);
    }
  }, [installationId, dateFrom, dateTo, isRangeValid]);

  useEffect(() => {
    if (installationId && isRangeValid) {
      void fetchGrid();
    }
  }, [fetchGrid, installationId, isRangeValid]);

  function handleCellClick(day: DayRow, cell: GridCell) {
    if (selectedCell?.date === day.date && selectedCell?.slotKey === cell.slotKey) {
      setSelectedCell(null);
    } else {
      setSelectedCell({ date: day.date, slotKey: cell.slotKey, cell });
    }
  }

  async function handleExportExcel() {
    if (!installationId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        installationId,
        from: dateFrom,
        to: dateTo,
      });
      const res = await fetch(`/api/ops/rondas/reportes/export-instalacion?${params}`);
      if (!res.ok) throw new Error("Error exportando");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-rondas-${dateFrom}-${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Excel descargado");
    } catch {
      toast.error("Error exportando Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-end gap-3 flex-wrap rounded-xl border border-[#1a1f2e] bg-[#111827] p-3">
        <div className="w-full sm:w-64">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">
            Instalación
          </p>
          <SearchableSelect
            value={installationId}
            options={instOptions}
            placeholder="Seleccionar instalación..."
            onChange={(val) => {
              setInstallationId(val);
              setSelectedCell(null);
            }}
          />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">
            Desde
          </p>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-36"
          />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">
            Hasta
          </p>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-36"
          />
        </div>

        {/* Quick range presets */}
        <div className="flex items-end gap-1.5">
          {datePresets.map((preset) => {
            const isActive = dateFrom === preset.from && dateTo === preset.to;
            return (
              <button
                key={preset.label}
                onClick={() => {
                  setDateFrom(preset.from);
                  setDateTo(preset.to);
                }}
                className={cn(
                  "h-9 px-2.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-[#06b6d4]/15 text-[#06b6d4] border border-[#06b6d4]/30"
                    : "border border-[#1a1f2e] bg-[#0a0e1a] text-[#64748b] hover:text-[#f1f5f9] hover:border-[#64748b]/40",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {gridData && (
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Descargar Excel
          </button>
        )}

        {loading && (
          <div className="flex items-center gap-1.5 text-[#64748b]">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
            <span className="text-[11px]">Cargando...</span>
          </div>
        )}
      </div>

      {/* Range validation */}
      {diffDays > 30 && (
        <p className="text-xs text-status-warn-fg">
          El rango máximo es 30 días. Ajusta las fechas.
        </p>
      )}

      {/* Empty state: no installation selected */}
      {!installationId ? (
        <div className="text-center py-16 text-muted-foreground rounded-xl border border-[#1a1f2e] bg-[#111827]">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Selecciona una instalación</p>
          <p className="text-xs mt-1">
            Elige una instalación para ver el reporte detallado de rondas
          </p>
        </div>
      ) : gridData ? (
        <>
          {/* Cycle + range info */}
          <p className="text-xs text-[#94a3b8]">
            {diffDays} días · Ciclo {gridData.ciclo}
          </p>

          {/* Resumen del período */}
          <ResumenPeriodo resumen={gridData.resumen} />

          {/* Grid */}
          <GridInstalacion
            data={gridData}
            onCellClick={handleCellClick}
            selectedCell={selectedCell}
            onViewMap={setMapEjecucion}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(key) => {
              if (key === sortKey) {
                setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              } else {
                setSortKey(key);
                setSortDir(key === "date" ? "asc" : "desc");
              }
            }}
          />

          {/* Leyenda */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-status-ok-soft border border-status-ok-border" />{" "}
              100%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-status-warn-soft border border-status-warn-border" />{" "}
              70-99%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-status-warn-soft border border-status-warn-border" />{" "}
              1-69%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-status-danger-soft border border-status-danger-border" /> 0%
            </span>
            <span className="flex items-center gap-1.5 ml-2 border-l border-border pl-2">
              <span className="w-2 h-2 rounded-full bg-status-danger" /> Alerta pánico
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-warn" /> Incidente
            </span>
          </div>
        </>
      ) : null}

      {/* Audit map modal */}
      {mapEjecucion && (
        <RondaAuditMapModal
          key={mapEjecucion.id}
          row={ejecucionToMapRow(mapEjecucion)}
          onClose={() => setMapEjecucion(null)}
        />
      )}
    </div>
  );
}

// ── ResumenPeriodo ──

function ResumenPeriodo({ resumen }: { resumen: GridData["resumen"] }) {
  const kpis = [
    { label: "Total rondas", value: resumen.totalRondas, color: "#94a3b8" },
    { label: "Completadas", value: resumen.completadas, color: "#22c55e" },
    {
      label: "Cumplimiento",
      value: `${resumen.cumplimiento}%`,
      color:
        resumen.cumplimiento >= 90
          ? "#22c55e"
          : resumen.cumplimiento >= 70
            ? "#f59e0b"
            : "#ef4444",
    },
    { label: "No realizadas", value: resumen.noRealizadas, color: "#ef4444" },
  ];

  if (resumen.alertasPanico > 0) {
    kpis.push({ label: "Alertas pánico", value: resumen.alertasPanico, color: "#ef4444" });
  }
  if (resumen.totalIncidentes > 0) {
    kpis.push({ label: "Incidentes", value: resumen.totalIncidentes, color: "#f59e0b" });
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl border bg-[#111827] p-3 relative overflow-hidden"
          style={{
            borderColor: `${kpi.color}20`,
            borderLeftColor: kpi.color,
            borderLeftWidth: 3,
          }}
        >
          <p
            className="text-[11px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: `${kpi.color}99` }}
          >
            {kpi.label}
          </p>
          <p className="text-2xl font-extrabold tracking-tight" style={{ color: kpi.color }}>
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── GridInstalacion ──

function GridInstalacion({
  data,
  onCellClick,
  selectedCell,
  onViewMap,
  sortKey,
  sortDir,
  onSort,
}: {
  data: GridData;
  onCellClick: (day: DayRow, cell: GridCell) => void;
  selectedCell: SelectedCell | null;
  onViewMap: (ej: EjecucionCell) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  // Sort days
  const sortedDays = useMemo(() => {
    const sorted = [...data.days];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = a.date.localeCompare(b.date);
      } else {
        // sort by total completadas/esperadas ratio, then absolute completadas
        const aPct = a.totalEsperadas > 0 ? a.totalCompletadas / a.totalEsperadas : 0;
        const bPct = b.totalEsperadas > 0 ? b.totalCompletadas / b.totalEsperadas : 0;
        cmp = aPct - bPct || a.totalCompletadas - b.totalCompletadas;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data.days, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1a1f2e]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-[#111827]">
            <th
              onClick={() => onSort("date")}
              className="sticky left-0 bg-[#111827] z-10 px-3 py-2 text-left text-[#64748b] font-semibold text-[11px] uppercase tracking-wider min-w-[110px] cursor-pointer hover:text-[#f1f5f9] transition-colors select-none"
            >
              <span className="inline-flex items-center gap-1">
                Día <SortIcon col="date" />
              </span>
            </th>
            {data.slots.map((slot) => (
              <th
                key={slot.label}
                className="px-1 py-2 text-center text-[#64748b] font-semibold text-[11px] min-w-[56px]"
              >
                {slot.label}
              </th>
            ))}
            <th
              onClick={() => onSort("total")}
              className="px-3 py-2 text-right text-[#64748b] font-semibold text-[11px] min-w-[70px] cursor-pointer hover:text-[#f1f5f9] transition-colors select-none"
            >
              <span className="inline-flex items-center gap-1 justify-end">
                Total <SortIcon col="total" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedDays.map((day) => {
            const isExpanded = selectedCell?.date === day.date;
            return (
              <DayGridRow
                key={day.date}
                day={day}
                slots={data.slots}
                onCellClick={onCellClick}
                selectedCell={selectedCell}
                isExpanded={isExpanded}
                onViewMap={onViewMap}
              />
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1a1f2e] bg-[#111827]">
            <td className="sticky left-0 bg-[#111827] z-10 px-3 py-2 font-semibold text-[#64748b] text-[11px] uppercase">
              Total
            </td>
            {data.slots.map((slot, i) => {
              const colC = data.days.reduce(
                (s, d) => s + (d.cells[i]?.completadas ?? 0),
                0,
              );
              const colE = data.days.reduce(
                (s, d) => s + (d.cells[i]?.esperadas ?? 0),
                0,
              );
              return (
                <td key={slot.label} className="px-1 py-2 text-center">
                  <span className="font-semibold text-[#94a3b8]">
                    {colC}/{colE}
                  </span>
                </td>
              );
            })}
            <td className="px-3 py-2 text-right font-bold text-[#f1f5f9]">
              {data.resumen.completadas}/
              {data.days.reduce((s, d) => s + d.totalEsperadas, 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── DayGridRow ──

function DayGridRow({
  day,
  slots,
  onCellClick,
  selectedCell,
  isExpanded,
  onViewMap,
}: {
  day: DayRow;
  slots: GridData["slots"];
  onCellClick: (day: DayRow, cell: GridCell) => void;
  selectedCell: SelectedCell | null;
  isExpanded: boolean;
  onViewMap: (ej: EjecucionCell) => void;
}) {
  const dayPct =
    day.totalEsperadas > 0
      ? day.totalCompletadas / day.totalEsperadas
      : 0;

  return (
    <>
      <tr className="border-t border-[#1a1f2e]/50 hover:bg-[#111827]/50">
        {/* Día (sticky) */}
        <td className="sticky left-0 bg-[#0a0e1a] z-10 px-3 py-1.5 font-medium whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-[#f1f5f9]">{day.dayLabel}</span>
            {day.totalAlerts > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
            )}
          </div>
        </td>

        {/* Celdas por slot */}
        {day.cells.map((cell) => (
          <td key={cell.slotKey} className="px-0.5 py-1">
            <button
              onClick={() => onCellClick(day, cell)}
              className={cn(
                "w-full flex flex-col items-center justify-center rounded-md py-1.5 px-1 transition-all",
                "hover:ring-1 hover:ring-[#06b6d4]/50 cursor-pointer relative",
                getCellColor(cell),
                selectedCell?.date === day.date &&
                  selectedCell?.slotKey === cell.slotKey &&
                  "ring-2 ring-[#06b6d4]",
              )}
            >
              <span className="font-semibold text-[#f1f5f9] tabular-nums">
                {cell.completadas}/{cell.esperadas}
              </span>
              {(cell.alertCount > 0 || cell.incidentCount > 0) && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0a0e1a]",
                    cell.hasPanico ? "bg-status-danger" : "bg-status-warn",
                  )}
                />
              )}
            </button>
          </td>
        ))}

        {/* Total del día */}
        <td className="px-3 py-1.5 text-right">
          <span
            className={cn(
              "font-semibold tabular-nums",
              dayPct >= 0.9
                ? "text-status-ok-fg"
                : dayPct >= 0.7
                  ? "text-status-warn-fg"
                  : "text-status-danger-fg",
            )}
          >
            {day.totalCompletadas}/{day.totalEsperadas}
          </span>
        </td>
      </tr>

      {/* Drill-down panel */}
      {isExpanded && selectedCell && (
        <tr>
          <td colSpan={slots.length + 2} className="p-0">
            <CellDetailPanel
              cell={selectedCell.cell}
              dayLabel={day.dayLabel}
              onViewMap={onViewMap}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── CellDetailPanel ──

function CellDetailPanel({
  cell,
  dayLabel,
  onViewMap,
}: {
  cell: GridCell;
  dayLabel: string;
  onViewMap: (ej: EjecucionCell) => void;
}) {
  if (cell.ejecuciones.length === 0) {
    return (
      <div className="px-4 py-3 bg-[#0a0e1a] border-t border-[#1a1f2e] text-xs text-[#64748b]">
        Sin ejecuciones en este slot ({dayLabel} · {cell.slotKey})
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-[#0a0e1a] border-t border-[#1a1f2e] space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
      <p className="text-[10px] uppercase font-semibold text-[#64748b] tracking-wider">
        {dayLabel} · {cell.slotKey} — {cell.ejecuciones.length} ronda
        {cell.ejecuciones.length !== 1 ? "s" : ""}
      </p>
      {cell.ejecuciones.map((ej) => (
        <EjecucionCard key={ej.id} ej={ej} onViewMap={onViewMap} />
      ))}
    </div>
  );
}

// ── EjecucionCard ──

function EjecucionCard({
  ej,
  onViewMap,
}: {
  ej: EjecucionCell;
  onViewMap: (ej: EjecucionCell) => void;
}) {
  const Icon = STATUS_ICON[ej.status] ?? Clock;
  const iconColor = STATUS_ICON_COLOR[ej.status] ?? "text-zinc-400";
  const trustColor =
    ej.trustScore >= 85
      ? "text-status-ok-fg"
      : ej.trustScore >= 70
        ? "text-status-info-fg"
        : ej.trustScore >= 50
          ? "text-status-warn-fg"
          : "text-status-danger-fg";

  return (
    <div className="rounded-lg border border-[#1a1f2e] bg-[#111827] p-3 text-xs space-y-2">
      {/* Row 1: status + template + guardia */}
      <div className="flex items-center gap-3 flex-wrap">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <span className="font-medium text-[#f1f5f9]">
          {ej.templateName ?? "Ronda"}
        </span>
        <span className="text-[#94a3b8]">{ej.guardiaName}</span>
        {ej.startedAt && (
          <span className="text-[#64748b] tabular-nums">
            {formatHour(ej.startedAt)}
            {ej.completedAt ? ` → ${formatHour(ej.completedAt)}` : " (en curso)"}
          </span>
        )}
      </div>

      {/* Row 2: metrics */}
      <div className="flex items-center gap-4 text-[#94a3b8] flex-wrap">
        <span>
          CP: {ej.checkpointsCompletados}/{ej.checkpointsTotal} ({ej.completionPercent}%)
        </span>
        <span className={trustColor}>Trust: {ej.trustScore}</span>
        {ej.durationMinutes != null && <span>{ej.durationMinutes} min</span>}
        {ej.alertCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-status-danger-soft text-status-danger-fg border border-status-danger-border">
            <AlertTriangle className="h-3 w-3" />
            {ej.alertCount}
          </span>
        )}
        {ej.incidentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-status-warn-soft text-status-warn-fg border border-status-warn-border">
            <FileWarning className="h-3 w-3" />
            {ej.incidentCount}
          </span>
        )}
      </div>

      {/* Actions */}
      {ej.status !== "no_realizada" && ej.status !== "pendiente" && (
        <button
          onClick={() => onViewMap(ej)}
          className="inline-flex items-center gap-1.5 rounded-md bg-status-info-soft px-3 py-1.5 text-xs font-medium text-status-info-fg hover:brightness-110 transition-colors"
        >
          <MapPin className="h-3.5 w-3.5" />
          Ver recorrido
        </button>
      )}
    </div>
  );
}

// ── Helpers ──

function ejecucionToMapRow(ej: EjecucionCell): ReporteRow {
  return {
    id: ej.id,
    scheduledAt: ej.startedAt ?? "",
    startedAt: ej.startedAt,
    completedAt: ej.completedAt,
    installation: "",
    installationId: null,
    template: ej.templateName ?? "",
    isAdHoc: false,
    guardiaId: null,
    guardia: ej.guardiaName,
    guardiaCode: "",
    rut: "",
    status: ej.status,
    checkpointsTotal: ej.checkpointsTotal,
    checkpointsCompletados: ej.checkpointsCompletados,
    porcentajeCompletado: ej.completionPercent,
    trustScore: ej.trustScore,
    trustBreakdown: null,
    durationMinutes: ej.durationMinutes,
    notes: null,
    walkRoute: null,
    routeSnapshot: null,
    marcaciones: [],
  };
}
