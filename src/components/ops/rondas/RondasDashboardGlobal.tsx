"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trophy,
  Camera,
  Mic,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  MapPin,
  FileWarning,
  LayoutGrid,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RondaAuditMapModal } from "./RondaAuditMapModal";
import type { ReporteRow } from "./RondasReportesTable";

interface RondaCell {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  template: string;
  isAdHoc: boolean;
  guardia: string;
  status: string;
  completion: { completados: number; total: number; porcentaje: number };
  durationMinutes: number | null;
  evidencia: { photos: number; audio: number };
  trustScore: number;
  incidentCount: number;
  alertCount: number;
  walkRoute: Array<{ lat: number; lng: number }> | null;
  routeSnapshot: Array<{ id: string; name: string; lat: number; lng: number; orderIndex: number; status: string }> | null;
  notes: string | null;
  trustBreakdown: Record<string, unknown> | null;
}

interface InstalacionRow {
  installationId: string;
  installationName: string;
  rondas: RondaCell[];
  resumen: {
    total: number;
    completadas: number;
    incompletas: number;
    noRealizadas: number;
    porcentajeCumplimiento: number;
  };
}

interface ResumenGlobal {
  totalRondas: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  porcentajeCumplimiento: number;
  instalacionesCriticas: { installationId: string; installationName: string }[];
  mejorGuardia: { nombre: string; porcentaje: number; duracionPromedio: number | null } | null;
  peorGuardia: { nombre: string; porcentaje: number } | null;
}

interface DashboardData {
  fecha: string;
  ciclo: { inicio: string; fin: string };
  instalaciones: InstalacionRow[];
  resumenGlobal: ResumenGlobal;
}

const STATUS_BG: Record<string, string> = {
  completada: "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30",
  incompleta: "bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30",
  no_realizada: "bg-red-500/20 border-red-500/40 hover:bg-red-500/30",
  pendiente: "bg-zinc-700/30 border-zinc-600/40 hover:bg-zinc-700/40",
  en_curso: "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completada: CheckCircle2,
  incompleta: AlertTriangle,
  no_realizada: XCircle,
  pendiente: Clock,
  en_curso: Loader2,
};

const STATUS_ICON_COLOR: Record<string, string> = {
  completada: "text-emerald-400",
  incompleta: "text-amber-400",
  no_realizada: "text-red-400",
  pendiente: "text-zinc-500",
  en_curso: "text-blue-400",
};

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function RondaCellBlock({
  ronda,
  onClick,
  isSelected,
}: {
  ronda: RondaCell;
  onClick: () => void;
  isSelected: boolean;
}) {
  const Icon = STATUS_ICON[ronda.status] ?? Clock;
  const iconColor = STATUS_ICON_COLOR[ronda.status] ?? "text-zinc-400";
  const bg = STATUS_BG[ronda.status] ?? STATUS_BG.pendiente;

  const hasIssues = ronda.incidentCount > 0 || ronda.alertCount > 0;

  return (
    <button
      onClick={onClick}
      title={`${ronda.template} — ${ronda.completion.completados}/${ronda.completion.total} checkpoints${hasIssues ? " — Con alertas/incidentes" : ""}`}
      className={cn(
        "relative flex flex-col items-center rounded-lg border px-3 py-2 min-w-[72px] transition-all cursor-pointer",
        bg,
        isSelected && "ring-2 ring-cyan-400/60",
      )}
    >
      {ronda.isAdHoc && (
        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold uppercase bg-purple-500/90 text-white px-1 py-px rounded leading-tight">
          Libre
        </span>
      )}
      {!ronda.isAdHoc && hasIssues && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[#111827]" />
      )}
      <span className="text-[11px] font-semibold text-[#f1f5f9] tabular-nums">
        {formatHour(ronda.scheduledAt)}
      </span>
      <Icon
        className={cn("h-4 w-4 mt-1", iconColor, ronda.status === "en_curso" && "animate-spin")}
      />
      <span className="text-[10px] text-[#94a3b8] mt-0.5 tabular-nums">
        {ronda.completion.completados}/{ronda.completion.total}
      </span>
    </button>
  );
}

function RondaDetail({
  ronda,
  installationName,
  onViewMap,
}: {
  ronda: RondaCell;
  installationName: string;
  onViewMap: (ronda: RondaCell) => void;
}) {
  const trustColor =
    ronda.trustScore >= 85
      ? "text-emerald-400"
      : ronda.trustScore >= 70
        ? "text-blue-400"
        : ronda.trustScore >= 50
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className="rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] p-3 mt-2 text-xs space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Row 1: key info */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Tipo</p>
          {ronda.isAdHoc ? (
            <span className="text-[10px] font-bold uppercase bg-purple-500/80 text-white px-1.5 py-0.5 rounded">Libre</span>
          ) : (
            <span className="text-[10px] font-bold uppercase bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">Programada</span>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Plantilla</p>
          <p className="text-[#f1f5f9]">{ronda.template}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Guardia</p>
          <p className="text-[#f1f5f9]">{ronda.guardia || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Horario</p>
          <p className="text-[#f1f5f9]">
            {ronda.startedAt
              ? `${formatHour(ronda.startedAt)}${ronda.completedAt ? ` → ${formatHour(ronda.completedAt)}` : " (en curso)"}`
              : "Sin inicio"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Duración</p>
          <p className="text-[#f1f5f9]">
            {ronda.durationMinutes != null ? `${ronda.durationMinutes} min` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Trust Score</p>
          {ronda.isAdHoc ? (
            <span className="text-[11px] text-[#64748b]">N/A</span>
          ) : (
            <p className={cn("font-bold", trustColor)}>{ronda.trustScore}</p>
          )}
        </div>
      </div>

      {/* Row 2: completion + evidence + badges */}
      <div className="flex flex-wrap items-center gap-3 text-[#94a3b8]">
        <span>
          Cumplimiento: {ronda.completion.completados}/{ronda.completion.total} (
          {ronda.completion.porcentaje}%)
        </span>
        {ronda.evidencia.photos > 0 && (
          <span className="inline-flex items-center gap-0.5 text-blue-400">
            <Camera className="h-3 w-3" />
            {ronda.evidencia.photos}
          </span>
        )}
        {ronda.evidencia.audio > 0 && (
          <span className="inline-flex items-center gap-0.5 text-purple-400">
            <Mic className="h-3 w-3" />
            {ronda.evidencia.audio}
          </span>
        )}
        {ronda.alertCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle className="h-3 w-3" />
            {ronda.alertCount} alerta{ronda.alertCount !== 1 ? "s" : ""}
          </span>
        )}
        {ronda.incidentCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <FileWarning className="h-3 w-3" />
            {ronda.incidentCount} incidente{ronda.incidentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Row 3: notes */}
      {ronda.notes && (
        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2">
          <p className="text-[11px] font-medium text-yellow-500/80 mb-0.5">Comentario del guardia:</p>
          <p className="text-[11px] text-zinc-300 italic">&ldquo;{ronda.notes}&rdquo;</p>
        </div>
      )}

      {/* Row 4: actions */}
      {ronda.status !== "no_realizada" && ronda.status !== "pendiente" && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onViewMap(ronda)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-500/25 transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            Ver recorrido en mapa
          </button>
        </div>
      )}
    </div>
  );
}


/** Build a minimal ReporteRow-compatible object for the audit map modal */
function rondaCellToMapRow(ronda: RondaCell, inst: InstalacionRow): ReporteRow {
  return {
    id: ronda.id,
    scheduledAt: ronda.scheduledAt,
    startedAt: ronda.startedAt,
    completedAt: ronda.completedAt,
    installation: inst.installationName,
    installationId: inst.installationId,
    template: ronda.template,
    isAdHoc: ronda.isAdHoc,
    guardiaId: null,
    guardia: ronda.guardia,
    guardiaCode: "",
    rut: "",
    status: ronda.status,
    checkpointsTotal: ronda.completion.total,
    checkpointsCompletados: ronda.completion.completados,
    porcentajeCompletado: ronda.completion.porcentaje,
    trustScore: ronda.trustScore,
    trustBreakdown: ronda.trustBreakdown as any,
    durationMinutes: ronda.durationMinutes,
    notes: ronda.notes,
    walkRoute: ronda.walkRoute,
    routeSnapshot: ronda.routeSnapshot,
    marcaciones: [],
  };
}

function InstalacionGridRow({ inst }: { inst: InstalacionRow }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRonda, setSelectedRonda] = useState<string | null>(null);
  const [mapRonda, setMapRonda] = useState<RondaCell | null>(null);

  const pct = inst.resumen.porcentajeCumplimiento;
  const barColor =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-zinc-600";

  const selected = inst.rondas.find((r) => r.id === selectedRonda);

  // Count total alerts/incidents across all rondas in this installation
  const totalAlerts = inst.rondas.reduce((sum, r) => sum + r.alertCount, 0);
  const totalIncidents = inst.rondas.reduce((sum, r) => sum + r.incidentCount, 0);

  return (
    <>
      <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Chevron toggle — separate clickable area */}
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (expanded) setSelectedRonda(null);
            }}
            className="shrink-0 p-1 -m-1 rounded hover:bg-[#1a1f2e] transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-[#64748b]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#64748b]" />
            )}
          </button>

          {/* Installation name — also toggles expand */}
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (expanded) setSelectedRonda(null);
            }}
            className="w-40 shrink-0 text-left hover:bg-[#1a1f2e]/50 rounded px-1 -mx-1 py-0.5 transition-colors"
          >
            <p className="text-sm font-semibold text-[#f1f5f9] truncate">{inst.installationName}</p>
            <p className="text-[10px] text-[#64748b]">
              {inst.resumen.total} rondas
              {(totalAlerts > 0 || totalIncidents > 0) && (
                <span className="text-red-400 ml-1">
                  {totalAlerts > 0 && `${totalAlerts} alerta${totalAlerts !== 1 ? "s" : ""}`}
                  {totalAlerts > 0 && totalIncidents > 0 && " · "}
                  {totalIncidents > 0 && `${totalIncidents} incidente${totalIncidents !== 1 ? "s" : ""}`}
                </span>
              )}
            </p>
          </button>

          {/* Timeline cells */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin">
            {inst.rondas.map((ronda) => (
              <RondaCellBlock
                key={ronda.id}
                ronda={ronda}
                isSelected={selectedRonda === ronda.id}
                onClick={() => {
                  if (selectedRonda === ronda.id) {
                    setSelectedRonda(null);
                  } else {
                    setSelectedRonda(ronda.id);
                    setExpanded(true);
                  }
                }}
              />
            ))}
          </div>

          {/* Summary */}
          <div className="w-24 shrink-0 text-right">
            <p className="text-sm font-bold text-[#f1f5f9] tabular-nums">
              {inst.resumen.completadas}/{inst.resumen.total}
            </p>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              <div className="w-16 h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", barColor)}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-[10px] text-[#94a3b8] tabular-nums w-8 text-right">{pct}%</span>
            </div>
          </div>
        </div>

        {/* Expanded detail with animation */}
        <div
          className={cn(
            "grid transition-all duration-200 ease-out",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-3 space-y-2 border-t border-[#1a1f2e]">
              {selected ? (
                <RondaDetail
                  ronda={selected}
                  installationName={inst.installationName}
                  onViewMap={(r) => setMapRonda(r)}
                />
              ) : (
                <div className="pt-2 space-y-1">
                  {inst.rondas.map((ronda) => {
                    const st = STATUS_ICON_COLOR[ronda.status] ?? "text-zinc-400";
                    const Icon = STATUS_ICON[ronda.status] ?? Clock;
                    const hasIssues = ronda.incidentCount > 0 || ronda.alertCount > 0;
                    return (
                      <button
                        key={ronda.id}
                        onClick={() => setSelectedRonda(ronda.id)}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs hover:bg-[#1a1f2e]/60 transition-colors text-left"
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", st)} />
                        <span className="text-[#f1f5f9] font-medium tabular-nums w-12">
                          {formatHour(ronda.scheduledAt)}
                        </span>
                        {ronda.isAdHoc ? (
                          <span className="text-[9px] font-bold uppercase bg-purple-500/80 text-white px-1 py-px rounded shrink-0">Libre</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase bg-cyan-500/80 text-white px-1 py-px rounded shrink-0">Prog.</span>
                        )}
                        <span className="text-[#94a3b8] truncate flex-1">{ronda.template}</span>
                        <span className="text-[#94a3b8] truncate max-w-[140px]">{ronda.guardia || "—"}</span>
                        <span className="text-[#94a3b8] tabular-nums">
                          {ronda.completion.completados}/{ronda.completion.total}
                        </span>
                        {hasIssues && (
                          <span className="flex items-center gap-1">
                            {ronda.alertCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] bg-red-500/20 text-red-400">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {ronda.alertCount}
                              </span>
                            )}
                            {ronda.incidentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] bg-amber-500/20 text-amber-400">
                                <FileWarning className="h-2.5 w-2.5" />
                                {ronda.incidentCount}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Audit map modal */}
      {mapRonda && (
        <RondaAuditMapModal
          key={mapRonda.id}
          row={rondaCellToMapRow(mapRonda, inst)}
          onClose={() => setMapRonda(null)}
        />
      )}
    </>
  );
}

/** Returns a Tailwind bg class based on compliance percentage (heat map) */
function complianceBg(pct: number): string {
  if (pct === 0) return "bg-red-500/70 text-white";
  if (pct < 40) return "bg-red-500/50 text-red-100";
  if (pct < 60) return "bg-amber-500/50 text-amber-100";
  if (pct < 75) return "bg-yellow-500/40 text-yellow-100";
  if (pct < 90) return "bg-lime-500/40 text-lime-100";
  if (pct < 100) return "bg-emerald-500/40 text-emerald-100";
  return "bg-emerald-500/70 text-white";
}

/* ────────────────────────────────────────────────────────────────
   Multi-day range table view
   ──────────────────────────────────────────────────────────────── */

interface DayCell {
  total: number;
  completadas: number;
  porcentaje: number;
}

interface RangoInstalacion {
  installationId: string;
  installationName: string;
  dias: Record<string, DayCell>;
  resumen: { total: number; completadas: number; porcentaje: number };
}

interface RangoData {
  desde: string;
  hasta: string;
  fechas: string[];
  instalaciones: RangoInstalacion[];
  totalesPorDia: Record<string, DayCell>;
}

type RangoPreset = "3d" | "7d" | "30d" | "custom";

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return dayNames[d.getDay()];
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function ResumenTablaRangoView({
  rangoData,
  loading,
  desde,
  hasta,
  preset,
  onPresetChange,
  onDesdeChange,
  onHastaChange,
}: {
  rangoData: RangoData | null;
  loading: boolean;
  desde: string;
  hasta: string;
  preset: RangoPreset;
  onPresetChange: (p: RangoPreset) => void;
  onDesdeChange: (d: string) => void;
  onHastaChange: (d: string) => void;
}) {
  const today = getLocalDate();

  return (
    <div className="space-y-3">
      {/* Range controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        {(
          [
            { key: "3d" as RangoPreset, label: "3 días" },
            { key: "7d" as RangoPreset, label: "Semana" },
            { key: "30d" as RangoPreset, label: "30 días" },
          ] as const
        ).map((p) => (
          <button
            key={p.key}
            onClick={() => onPresetChange(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              preset === p.key
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-[#0a0e1a] border-[#1a1f2e] text-[#94a3b8] hover:bg-[#1a1f2e] hover:text-[#f1f5f9]",
            )}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-6 bg-[#1a1f2e] mx-1" />

        {/* Custom date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={desde}
            onChange={(e) => {
              onDesdeChange(e.target.value);
              onPresetChange("custom");
            }}
            className="h-8 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[12px] text-[#f1f5f9] px-2 w-[130px]"
          />
          <span className="text-[11px] text-[#64748b]">→</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => {
              onHastaChange(e.target.value);
              onPresetChange("custom");
            }}
            className="h-8 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[12px] text-[#f1f5f9] px-2 w-[130px]"
          />
        </div>

        {loading && (
          <div className="flex items-center gap-1.5 text-[#64748b] ml-2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
            <span className="text-[11px]">Cargando...</span>
          </div>
        )}
      </div>

      {/* Table */}
      {rangoData && rangoData.fechas.length > 0 && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1a1f2e] text-[11px] uppercase tracking-wider text-[#64748b]">
                <th className="text-left px-3 py-3 font-semibold sticky left-0 bg-[#111827] z-10 whitespace-nowrap">
                  Instalación
                </th>
                {rangoData.fechas.map((fecha) => {
                  const isToday = fecha === today;
                  return (
                    <th
                      key={fecha}
                      className={cn(
                        "text-center px-1.5 py-3 font-semibold whitespace-nowrap",
                        isToday && "bg-cyan-500/5",
                      )}
                    >
                      <div className="leading-tight">
                        <span className="block text-[10px] text-[#64748b]">
                          {formatDayLabel(fecha)}
                        </span>
                        <span className={cn("block", isToday && "text-cyan-400")}>
                          {formatShortDate(fecha)}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="text-center px-2 py-3 font-semibold whitespace-nowrap bg-[#0a0e1a]/40">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rangoData.instalaciones.map((inst) => (
                <tr
                  key={inst.installationId}
                  className="border-b border-[#1a1f2e]/60 hover:bg-[#1a1f2e]/30 transition-colors"
                >
                  <td className="px-3 py-2 text-[#f1f5f9] font-medium align-middle sticky left-0 bg-[#111827] z-10 whitespace-nowrap">
                    {inst.installationName}
                  </td>
                  {rangoData.fechas.map((fecha) => {
                    const day = inst.dias[fecha];
                    const isToday = fecha === today;
                    if (!day || day.total === 0) {
                      return (
                        <td
                          key={fecha}
                          className={cn(
                            "px-1.5 py-2 text-center align-middle",
                            isToday && "bg-cyan-500/5",
                          )}
                        >
                          <span className="text-[11px] text-[#334155]">—</span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={fecha}
                        className={cn(
                          "px-2 py-2 text-center align-middle",
                          isToday && "bg-cyan-500/5",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[44px]",
                            complianceBg(day.porcentaje),
                          )}
                        >
                          {day.porcentaje}%
                        </span>
                        {isToday && (
                          <span className="block text-[10px] text-[#94a3b8] mt-0.5 tabular-nums">
                            {day.completadas}/{day.total}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center align-middle bg-[#0a0e1a]/40">
                    <span
                      className={cn(
                        "inline-block rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums min-w-[50px]",
                        complianceBg(inst.resumen.porcentaje),
                      )}
                    >
                      {inst.resumen.porcentaje}%
                    </span>
                    <span className="block text-[10px] text-[#64748b] mt-0.5 tabular-nums">
                      {inst.resumen.completadas}/{inst.resumen.total}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1a1f2e] bg-[#0a0e1a]/60">
                <td className="px-3 py-3 text-[#f1f5f9] font-bold align-middle sticky left-0 bg-[#0a0e1a] z-10 whitespace-nowrap">
                  Total general
                </td>
                {rangoData.fechas.map((fecha) => {
                  const day = rangoData.totalesPorDia[fecha];
                  const isToday = fecha === today;
                  if (!day || day.total === 0) {
                    return (
                      <td
                        key={fecha}
                        className={cn(
                          "px-1.5 py-3 text-center align-middle",
                          isToday && "bg-cyan-500/5",
                        )}
                      >
                        <span className="text-[11px] text-[#334155]">—</span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={fecha}
                      className={cn(
                        "px-2 py-3 text-center align-middle",
                        isToday && "bg-cyan-500/5",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[44px]",
                          complianceBg(day.porcentaje),
                        )}
                      >
                        {day.porcentaje}%
                      </span>
                      {isToday && (
                        <span className="block text-[10px] text-[#94a3b8] mt-0.5 tabular-nums">
                          {day.completadas}/{day.total}
                        </span>
                      )}
                    </td>
                  );
                })}
                {/* Total column footer */}
                {(() => {
                  let t = 0, c = 0;
                  for (const d of Object.values(rangoData.totalesPorDia)) { t += d.total; c += d.completadas; }
                  const pct = t > 0 ? Math.round((c / t) * 100) : 0;
                  return (
                    <td className="px-2 py-3 text-center align-middle bg-[#0a0e1a]/40">
                      <span className={cn("inline-block rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums min-w-[50px]", complianceBg(pct))}>
                        {pct}%
                      </span>
                      <span className="block text-[10px] text-[#64748b] mt-0.5 tabular-nums">
                        {c}/{t}
                      </span>
                    </td>
                  );
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rangoData && rangoData.instalaciones.length === 0 && !loading && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-8 text-center text-sm text-[#64748b]">
          Sin rondas en el rango seleccionado
        </div>
      )}
    </div>
  );
}

interface Props {
  initialDate?: string;
}

function getLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function RondasDashboardGlobal({ initialDate }: Props) {
  // Start with initialDate or empty; set local date in useEffect to avoid SSR/UTC mismatch
  const [fecha, setFecha] = useState(initialDate ?? "");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Range state for table view
  const [rangoPreset, setRangoPreset] = useState<RangoPreset>("3d");
  const [rangoDesde, setRangoDesde] = useState(() => getDateNDaysAgo(3));
  const [rangoHasta, setRangoHasta] = useState(() => getYesterday());
  const [rangoData, setRangoData] = useState<RangoData | null>(null);
  const [rangoLoading, setRangoLoading] = useState(false);

  // Set today's date on the client to avoid UTC issues from SSR
  useEffect(() => {
    if (!initialDate) {
      setFecha(getLocalDate());
    }
  }, [initialDate]);

  const fetchData = useCallback(async (d: string) => {
    if (!d) return; // Skip if date not yet initialized
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/rondas/reportes/dashboard-diario?fecha=${d}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error ?? "Error cargando dashboard");
      }
    } catch {
      toast.error("Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch range data for table view
  const fetchRangoData = useCallback(async (desde: string, hasta: string) => {
    if (!desde || !hasta) return;
    setRangoLoading(true);
    try {
      const res = await fetch(`/api/ops/rondas/reportes/dashboard-rango?desde=${desde}&hasta=${hasta}`);
      const json = await res.json();
      if (json.success) {
        setRangoData(json.data);
      } else {
        toast.error(json.error ?? "Error cargando rango");
      }
    } catch {
      toast.error("Error cargando rango");
    } finally {
      setRangoLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(fecha);
  }, [fecha, fetchData]);

  // Fetch range data when table view is active or range changes
  useEffect(() => {
    if (viewMode === "table") {
      void fetchRangoData(rangoDesde, rangoHasta);
    }
  }, [viewMode, rangoDesde, rangoHasta, fetchRangoData]);

  // Handle preset changes
  const handlePresetChange = useCallback((p: RangoPreset) => {
    setRangoPreset(p);
    const ayer = getYesterday();
    setRangoHasta(ayer);
    if (p === "3d") setRangoDesde(getDateNDaysAgo(3));
    else if (p === "7d") setRangoDesde(getDateNDaysAgo(7));
    else if (p === "30d") setRangoDesde(getDateNDaysAgo(30));
  }, []);

  // Auto-refresh if viewing today
  useEffect(() => {
    const today = getLocalDate();
    if (fecha !== today) return;
    const interval = setInterval(() => void fetchData(fecha), 60_000);
    return () => clearInterval(interval);
  }, [fecha, fetchData]);

  const resumen = data?.resumenGlobal;

  return (
    <div className="space-y-4">
      {/* Date picker + cycle info + day nav */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1a1f2e] bg-[#111827] px-4 py-3">
        <button
          onClick={() => {
            const d = new Date(fecha);
            d.setDate(d.getDate() - 1);
            setFecha(d.toISOString().slice(0, 10));
          }}
          className="p-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-[#94a3b8]" />
        </button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-40"
        />
        <button
          onClick={() => {
            const d = new Date(fecha);
            d.setDate(d.getDate() + 1);
            setFecha(d.toISOString().slice(0, 10));
          }}
          className="p-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
        </button>

        {data?.ciclo && (
          <div className="text-xs text-[#94a3b8]">
            Ciclo:{" "}
            <span className="text-[#f1f5f9] font-medium">
              {formatHour(data.ciclo.inicio)} → {formatHour(data.ciclo.fin)} (+1)
            </span>
          </div>
        )}

        {resumen && (
          <div className="flex items-center gap-4 text-xs text-[#94a3b8] ml-auto">
            <span>
              <span className="text-[#f1f5f9] font-semibold">{resumen.totalRondas}</span> rondas
            </span>
            <span>
              <span className="text-emerald-400 font-semibold">{resumen.completadas}</span> completadas
            </span>
            {resumen.incompletas > 0 && (
              <span>
                <span className="text-amber-400 font-semibold">{resumen.incompletas}</span> incompletas
              </span>
            )}
            {resumen.noRealizadas > 0 && (
              <span>
                <span className="text-red-400 font-semibold">{resumen.noRealizadas}</span> no realizadas
              </span>
            )}
            <span>
              <span className="text-[#06b6d4] font-semibold">{resumen.porcentajeCumplimiento}%</span> cumplimiento
            </span>
          </div>
        )}

        {/* View mode toggle */}
        <div className="inline-flex rounded-lg border border-[#1a1f2e] overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
              viewMode === "grid"
                ? "bg-[#1a1f2e] text-[#f1f5f9]"
                : "bg-[#0a0e1a] text-[#64748b] hover:text-[#94a3b8]",
            )}
            title="Vista grilla"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l border-[#1a1f2e]",
              viewMode === "table"
                ? "bg-[#1a1f2e] text-[#f1f5f9]"
                : "bg-[#0a0e1a] text-[#64748b] hover:text-[#94a3b8]",
            )}
            title="Vista tabla resumen"
          >
            <Table2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={() => {
            const params = new URLSearchParams({ format: "xlsx", from: fecha, to: fecha });
            window.open(`/api/ops/rondas/reportes/export?${params}`, "_blank");
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition-colors"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel
        </button>

        {loading && (
          <div className="flex items-center gap-1.5 text-[#64748b]">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
            <span className="text-[11px]">Cargando...</span>
          </div>
        )}
      </div>

      {/* Grid or Table view */}
      {data && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">
            {viewMode === "grid" ? "Grilla de rondas por instalación" : "Resumen por instalación"}
          </p>
          {data.instalaciones.length === 0 && viewMode === "grid" ? (
            <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-8 text-center text-sm text-[#64748b]">
              Sin rondas programadas para este día
            </div>
          ) : viewMode === "table" ? (
            <ResumenTablaRangoView
              rangoData={rangoData}
              loading={rangoLoading}
              desde={rangoDesde}
              hasta={rangoHasta}
              preset={rangoPreset}
              onPresetChange={handlePresetChange}
              onDesdeChange={setRangoDesde}
              onHastaChange={setRangoHasta}
            />
          ) : (
            data.instalaciones.map((inst) => (
              <InstalacionGridRow key={inst.installationId} inst={inst} />
            ))
          )}
        </div>
      )}

      {/* Footer alerts */}
      {resumen && (
        <div className="space-y-2">
          {resumen.instalacionesCriticas.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
              <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-red-400">0% cumplimiento: </span>
                <span className="text-red-300">
                  {resumen.instalacionesCriticas.map((i) => i.installationName).join(", ")}
                </span>
              </div>
            </div>
          )}

          {resumen.mejorGuardia && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
              <Trophy className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-emerald-400">Mejor guardia: </span>
                <span className="text-emerald-300">
                  {resumen.mejorGuardia.nombre} ({resumen.mejorGuardia.porcentaje}%
                  {resumen.mejorGuardia.duracionPromedio != null &&
                    `, ${resumen.mejorGuardia.duracionPromedio} min prom`}
                  )
                </span>
              </div>
            </div>
          )}

          {resumen.peorGuardia &&
            resumen.peorGuardia.nombre !== resumen.mejorGuardia?.nombre && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-400">Peor guardia: </span>
                  <span className="text-amber-300">
                    {resumen.peorGuardia.nombre} ({resumen.peorGuardia.porcentaje}%)
                  </span>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
