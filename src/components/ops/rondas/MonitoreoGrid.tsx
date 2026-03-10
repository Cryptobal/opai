"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateTimeSlots } from "@/lib/rondas/grid-utils";
import { CoverageChip } from "@/components/ops/rondas/CoverageChip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CNRonda {
  id: string;
  rondaNumber: number;
  horaEsperada: string;
  horaMarcada: string | null;
  status: string;
  ejecucionRondaId: string | null;
  notes: string | null;
  autoPopulated: boolean;
  manualOverride: boolean;
  trustScore: number | null;
  trustColor: string | null;
  rondaExpected: boolean;
}

interface CNGuardia {
  id: string;
  guardiaNombre: string;
  horaLlegada: string | null;
  isExtra: boolean;
  guardiaId?: string | null;
  status: string; // pendiente, en_camino, presente, no_viene, reemplazo
  turno: string; // nocturno, diurno
  reemplazaDe?: string | null;
  notes?: string | null;
}

export type { CNGuardia };

interface CNInstalacion {
  id: string;
  installationId: string | null;
  installationName: string;
  orderIndex: number;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  horaLlegadaTurnoDia: string | null;
  guardiaDiaNombres: string | null;
  statusInstalacion: string;
  coberturaStatus: string; // pendiente, completa, parcial, descubierta
  notes: string | null;
  monitoreoType: string;
  rondaFrecuencia: number | null;
  rondasEsperadas: number;
  guardias: CNGuardia[];
  rondas: CNRonda[];
  installation: { id: string; name: string; lat: number | null; lng: number | null } | null;
}

interface ControlNocturnoData {
  id: string;
  shiftStart: string;
  shiftEnd: string;
  generalNotes: string | null;
  instalaciones: CNInstalacion[];
}

export interface CellModalData {
  ronda: CNRonda;
  installationName: string;
  installationId: string | null;
  /** Enriched by parent from active ronda rows */
  guardiaName?: string | null;
  templateName?: string | null;
  scheduledAt?: string | null;
}

interface MonitoreoGridProps {
  controlNocturno: ControlNocturnoData | null;
  turnoId: string | null;
  selectedInstallationId: string | null;
  onSelectInstallation: (id: string | null) => void;
  onCellClick?: (data: CellModalData) => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
  onInstallationDetail?: (instalacion: CNInstalacion) => void;
  isReadOnly?: boolean;
}

export type { CNInstalacion };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useCurrentHour() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const interval = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(interval);
  }, []);
  return hour;
}

function trustBg(score: number | null): string {
  if (score == null) return "bg-zinc-800/30";
  if (score >= 80) return "bg-emerald-500/12 border-emerald-500/25";
  if (score >= 60) return "bg-amber-500/12 border-amber-500/25";
  return "bg-red-500/12 border-red-500/25";
}

function trustTextColor(score: number | null): string {
  if (score == null) return "text-zinc-600";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function coberturaDot(status: string): string {
  if (status === "completa") return "bg-emerald-500";
  if (status === "parcial") return "bg-amber-500";
  if (status === "descubierta") return "bg-red-500";
  return "bg-zinc-600";
}

interface CellState {
  bg: string;
  border: string;
  icon: string;
  textColor: string;
  showTrust: boolean;
  pulse: boolean;
  subtle: boolean;
}

function getCellState(
  ronda: CNRonda,
  isCurrentSlot: boolean,
  isPastSlot: boolean,
): CellState {
  const base: CellState = {
    bg: "bg-[#0a0f1c]/50",
    border: "border-none",
    icon: "",
    textColor: "text-[#64748b]",
    showTrust: false,
    pulse: false,
    subtle: false,
  };

  // CELL WITH EXPECTED RONDA
  if (ronda.rondaExpected) {
    if (ronda.status === "completada" && ronda.autoPopulated && !ronda.manualOverride) {
      return { ...base, bg: trustBg(ronda.trustScore), border: "border border-solid", icon: "\u26A1", textColor: trustTextColor(ronda.trustScore), showTrust: true };
    }
    if (ronda.status === "completada" && ronda.manualOverride) {
      return { ...base, bg: trustBg(ronda.trustScore), border: "border border-solid", icon: "\u26A1\u270B", textColor: trustTextColor(ronda.trustScore), showTrust: true };
    }
    if (ronda.status === "completada" && !ronda.autoPopulated) {
      return { ...base, bg: "bg-emerald-500/10 border-emerald-500/20", border: "border border-solid", icon: "\u270B", textColor: "text-emerald-400" };
    }
    if (ronda.status === "omitida") {
      return { ...base, bg: "bg-red-500/12 border-red-500/25", border: "border border-solid", icon: "\u2715", textColor: "text-red-400" };
    }
    if (ronda.status === "no_aplica") {
      return { ...base, bg: "bg-zinc-800/20", border: "border border-dashed border-zinc-700/20", icon: "\u2014", textColor: "text-zinc-600", subtle: true };
    }
    if (ronda.status === "pendiente" && isPastSlot) {
      return { ...base, bg: "bg-red-500/10 border-red-500/25", border: "border border-solid", icon: "\u2715", textColor: "text-red-400" };
    }
    if (ronda.status === "pendiente" && isCurrentSlot) {
      return { ...base, bg: "bg-cyan-500/10 border-cyan-500/30", border: "border border-solid", textColor: "text-cyan-400", pulse: true };
    }
    // Future with expected ronda — subtle indigo tint (not red)
    return { ...base, bg: "bg-indigo-500/[0.04] border-indigo-500/10", border: "border border-dashed", textColor: "text-indigo-400/40" };
  }

  // CELL WITHOUT EXPECTED RONDA (manual check-in)
  if (ronda.status === "completada") {
    return { ...base, bg: "bg-emerald-500/6 border-emerald-500/12", border: "border border-dashed", icon: "\u270B", textColor: "text-emerald-400" };
  }
  if (ronda.status === "omitida") {
    return { ...base, bg: "bg-amber-500/8 border-amber-500/15", border: "border border-dashed", icon: "\u270B\uD83D\uDCDD", textColor: "text-amber-400" };
  }
  if (isPastSlot) {
    return { ...base, bg: "bg-[#0a0f1c]/30", icon: "\u00B7", subtle: true, textColor: "text-zinc-700" };
  }
  // Future without expected ronda
  return { ...base, bg: "bg-[#0a0f1c]/20", subtle: true, textColor: "text-zinc-700" };
}

function calculateGridSummary(cn: ControlNocturnoData | null) {
  if (!cn) return { completadas: 0, omitidas: 0, cumplimiento: 0 };
  const allRondas = (cn.instalaciones ?? []).flatMap((i) => i.rondas ?? []);
  const expected = allRondas.filter((r) => r.rondaExpected);
  const completadas = allRondas.filter((r) => r.status === "completada").length;
  const omitidas = allRondas.filter((r) => r.status === "omitida").length;
  const cumplimiento = expected.length > 0
    ? Math.round((expected.filter((r) => r.status === "completada").length / expected.length) * 100)
    : 0;
  return { completadas, omitidas, cumplimiento };
}

// ---------------------------------------------------------------------------
// GridRow
// ---------------------------------------------------------------------------

function GridRow({
  index,
  instalacion,
  timeSlots,
  currentSlotIdx,
  isSelected,
  onSelectInstallation,
  onCellClick,
  onGuardClick,
  onInstallationDetail,
}: {
  index: number;
  instalacion: CNInstalacion;
  timeSlots: string[];
  currentSlotIdx: number;
  isSelected: boolean;
  onSelectInstallation: (id: string | null) => void;
  onCellClick?: (data: CellModalData) => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
  onInstallationDetail?: (instalacion: CNInstalacion) => void;
}) {
  const currentHour = new Date().getHours();

  const nocturnos = (instalacion.guardias ?? []).filter((g) => g.turno === "nocturno" || !g.turno);
  const diurnos = (instalacion.guardias ?? []).filter((g) => g.turno === "diurno");

  const cobertura = instalacion.coberturaStatus ?? "pendiente";
  const isDescubierta = cobertura === "descubierta";

  const rowBg = isDescubierta
    ? "bg-red-500/[0.06] border-l-[3px] border-l-red-500"
    : isSelected
      ? "bg-cyan-500/[0.04] ring-1 ring-inset ring-cyan-500/20"
      : "";

  // First present guard's hora for the read-only Lleg. columns
  const primerLlegadaNoche = nocturnos.find((g) => g.horaLlegada && (g.status === "presente" || g.status === "reemplazo"))?.horaLlegada;
  const primerLlegadaDia = diurnos.find((g) => g.horaLlegada && (g.status === "presente" || g.status === "reemplazo"))?.horaLlegada;

  return (
    <tr
      data-installation-id={instalacion.installationId}
      className={`border-b border-[#1a1f2e]/60 transition-colors hover:bg-[#0a0f1c]/40 ${rowBg}`}
    >
      {/* # */}
      <td className="sticky left-0 z-10 bg-[#0a0f1c] px-2 py-1.5 text-[10px] text-zinc-600 font-mono tabular-nums">
        {index}
      </td>

      {/* Installation name */}
      <td className="sticky left-8 z-10 bg-[#0a0f1c] px-2 py-1.5">
        <button
          onClick={() => onSelectInstallation(
            isSelected ? null : instalacion.installationId,
          )}
          onDoubleClick={() => onInstallationDetail?.(instalacion)}
          className="text-left group"
          title="Click: seleccionar · Doble click: ver detalle"
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${coberturaDot(cobertura)}`} />
            <span className="text-[11px] font-medium text-[#f1f5f9] group-hover:text-cyan-400 transition-colors truncate max-w-[140px]">
              {instalacion.installationName}
            </span>
          </div>
          {instalacion.statusInstalacion !== "normal" && (
            <div className="text-[9px] mt-0.5 pl-3">
              <span className={
                instalacion.statusInstalacion === "critico" ? "text-red-400" : "text-amber-400"
              }>
                {instalacion.statusInstalacion}
              </span>
            </div>
          )}
        </button>
      </td>

      {/* Guard nocturno — CoverageChip */}
      <td className="px-1 py-1">
        <CoverageChip
          guardias={nocturnos}
          guardiasRequeridos={instalacion.guardiasRequeridos}
          coberturaStatus={cobertura}
          onClick={() => onGuardClick?.(instalacion, "nocturno")}
        />
      </td>

      {/* Llegada noche — read-only */}
      <td className="px-1 py-1.5 text-center">
        <span className="text-[10px] font-mono text-[#94a3b8] tabular-nums">
          {primerLlegadaNoche || "\u2014"}
        </span>
      </td>

      {/* Time slot cells */}
      {timeSlots.map((slot, i) => {
        const ronda = (instalacion.rondas ?? []).find((r) => r.rondaNumber === i + 1);
        if (!ronda) {
          return (
            <td key={slot} className="px-0.5 py-1">
              <div className="rounded bg-slate-800/10 min-h-[36px]" />
            </td>
          );
        }

        const isCurrentSlot = i === currentSlotIdx;
        const isPastSlot = (() => {
          if (currentSlotIdx >= 0) return i < currentSlotIdx;
          // Current hour not in any slot — determine if before or after shift
          const firstSlotHour = parseInt(timeSlots[0].split(":")[0], 10);
          const dist = (currentHour - firstSlotHour + 24) % 24;
          // Within shift span + 2h buffer → shift ended → all past
          // Beyond that → shift hasn't started → all future
          return dist > 0 && dist <= timeSlots.length + 2;
        })();

        const state = getCellState(ronda, isCurrentSlot, isPastSlot);

        return (
          <td key={slot} className={`px-0.5 py-1 ${isCurrentSlot ? "bg-cyan-500/[0.03]" : ""}`}>
            <div
              onClick={() => onCellClick?.({
                ronda,
                installationName: instalacion.installationName,
                installationId: instalacion.installationId,
              })}
              className={`rounded ${state.border} px-1 py-1 text-center cursor-pointer
                min-h-[36px] flex flex-col items-center justify-center transition-all
                hover:scale-[1.03] hover:z-10 ${state.bg} ${state.pulse ? "animate-pulse" : ""}`}
            >
              {ronda.horaMarcada ? (
                <>
                  <div className={`text-[10px] font-medium ${state.textColor}`}>
                    {ronda.horaMarcada}
                  </div>
                  <div className="text-[9px] font-bold flex items-center gap-0.5">
                    {state.showTrust && ronda.trustScore != null && (
                      <span className={trustTextColor(ronda.trustScore)}>
                        {ronda.trustScore}
                      </span>
                    )}
                    {state.icon && <span className="opacity-70">{state.icon}</span>}
                    {ronda.notes && <span className="text-blue-400">{"\uD83D\uDCAC"}</span>}
                  </div>
                </>
              ) : (
                <span className={`text-[10px] ${state.subtle ? "text-slate-700" : "text-slate-600"}`}>
                  {state.icon || "\u2014"}
                </span>
              )}
            </div>
          </td>
        );
      })}

      {/* Llegada dia — read-only */}
      <td className="px-1 py-1.5 text-center">
        <span className="text-[10px] font-mono text-[#94a3b8] tabular-nums">
          {primerLlegadaDia || "\u2014"}
        </span>
      </td>

      {/* Guard dia — CoverageChip */}
      <td className="px-1 py-1">
        <CoverageChip
          guardias={diurnos}
          guardiasRequeridos={diurnos.length || 1}
          coberturaStatus="pendiente"
          onClick={() => onGuardClick?.(instalacion, "diurno")}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// GridSummaryRow
// ---------------------------------------------------------------------------

function GridSummaryRow({
  timeSlots,
  instalaciones,
  summary,
}: {
  timeSlots: string[];
  instalaciones: CNInstalacion[];
  summary: { completadas: number; omitidas: number; cumplimiento: number };
}) {
  return (
    <tr>
      <td colSpan={4} className="px-3 py-2">
        <span className="text-[10px] text-[#64748b] font-semibold uppercase tracking-wider">Resumen</span>
        <span className="text-[10px] text-[#64748b] ml-2 tabular-nums">
          {summary.completadas} completadas &middot; {summary.omitidas} omitidas &middot; {summary.cumplimiento}%
        </span>
      </td>
      {timeSlots.map((slot) => {
        const slotRondas = instalaciones.flatMap((inst) =>
          (inst.rondas ?? []).filter((r) => r.horaEsperada === slot),
        );
        const completed = slotRondas.filter((r) => r.status === "completada").length;
        const expected = slotRondas.filter((r) => r.rondaExpected).length;
        const scores = slotRondas.filter((r) => r.trustScore != null && r.trustScore > 0);
        const avgTrust = scores.length > 0
          ? Math.round(scores.reduce((a, r) => a + (r.trustScore ?? 0), 0) / scores.length)
          : null;

        return (
          <td key={slot} className="text-center py-2">
            <div className="text-[9px] text-[#64748b] tabular-nums">
              {completed}/{expected > 0 ? expected : "\u2014"}
            </div>
            {avgTrust !== null && (
              <div className={`text-[8px] font-medium tabular-nums ${
                avgTrust >= 80 ? "text-emerald-400" : avgTrust >= 60 ? "text-amber-400" : "text-red-400"
              }`}>
                {avgTrust}
              </div>
            )}
          </td>
        );
      })}
      <td colSpan={2} />
    </tr>
  );
}

// ---------------------------------------------------------------------------
// GridEmptyState
// ---------------------------------------------------------------------------

function GridEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-12 bg-[#080c16]">
      <div className="w-14 h-14 rounded-xl bg-[#0a0f1c] border border-[#1a1f2e] flex items-center justify-center">
        <span className="text-2xl opacity-50">\uD83D\uDCCB</span>
      </div>
      <div className="text-center">
        <h3 className="text-[13px] font-medium text-[#94a3b8]">Grid Operativo</h3>
        <p className="text-[11px] text-[#64748b] mt-1.5 max-w-xs leading-relaxed">
          Inicia un turno para ver la planilla de control.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GridHeaderBar
// ---------------------------------------------------------------------------

function GridHeaderBar({
  totalInstalaciones,
  totalSlots,
  summary,
  isSaving,
  onExportPDF,
}: {
  totalInstalaciones: number;
  totalSlots: number;
  summary: { completadas: number; omitidas: number; cumplimiento: number };
  isSaving?: boolean;
  onExportPDF?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#0a0f1c] border-b border-[#1a1f2e] flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Grid operativo</span>
        <span className="text-[10px] text-[#475569] tabular-nums">
          {totalInstalaciones} inst. &middot; {totalSlots} slots
        </span>
        {isSaving && (
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/60">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Guardando
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-emerald-400 tabular-nums">{summary.completadas} completadas</span>
        {summary.omitidas > 0 && (
          <span className="text-[10px] text-red-400 tabular-nums">{summary.omitidas} omitidas</span>
        )}
        <span className={`text-[10px] font-bold tabular-nums ${
          summary.cumplimiento >= 80 ? "text-emerald-400"
          : summary.cumplimiento >= 60 ? "text-amber-400"
          : "text-red-400"
        }`}>
          {summary.cumplimiento}%
        </span>
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            className="px-2 py-0.5 rounded bg-[#111827] border border-[#1a1f2e] text-[10px] text-[#64748b] hover:text-[#f1f5f9] transition-colors"
          >
            PDF
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GridNotesSection
// ---------------------------------------------------------------------------

function GridNotesSection({
  controlNocturnoId,
  generalNotes,
  instalaciones,
  isReadOnly,
}: {
  controlNocturnoId: string;
  generalNotes: string | null;
  instalaciones: CNInstalacion[];
  isReadOnly?: boolean;
}) {
  const [notes, setNotes] = useState(generalNotes ?? "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/ops/rondas/monitoreo/grid/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlNocturnoId, generalNotes: value }),
      }).catch(() => {});
    }, 3000);
  };

  return (
    <div className="border-t border-[#1a1f2e] px-4 py-3 bg-[#080c16] flex-shrink-0">
      <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Notas generales</div>
      <textarea
        value={notes}
        onChange={isReadOnly ? undefined : (e) => handleChange(e.target.value)}
        readOnly={isReadOnly}
        rows={2}
        className={`w-full bg-[#0a0f1c] border border-[#1a1f2e] rounded-lg px-3 py-2 text-xs text-[#94a3b8] focus:border-cyan-500/50 focus:outline-none resize-none ${isReadOnly ? "opacity-60 cursor-default" : ""}`}
        placeholder="Notas generales del turno..."
      />

      {instalaciones.filter((i) => i.notes).length > 0 && (
        <>
          <div className="mt-3 text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">
            Comentarios por instalacion
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin">
            {instalaciones
              .filter((i) => i.notes)
              .map((inst, idx) => (
                <div key={inst.id} className="flex gap-2 text-[10px]">
                  <span className="text-[#64748b] font-medium min-w-[120px]">
                    {idx + 1}. {inst.installationName}
                  </span>
                  <span className="text-[#94a3b8]">{inst.notes}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonitoreoGrid (main export)
// ---------------------------------------------------------------------------

export default function MonitoreoGrid({
  controlNocturno,
  selectedInstallationId,
  onSelectInstallation,
  onCellClick,
  onGuardClick,
  onInstallationDetail,
  isReadOnly,
}: MonitoreoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = () => {
    setIsExporting(true);
    try {
      window.print();
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  const timeSlots = useMemo(
    () => generateTimeSlots(
      controlNocturno?.shiftStart ?? "19:00",
      controlNocturno?.shiftEnd ?? "08:00",
    ),
    [controlNocturno?.shiftStart, controlNocturno?.shiftEnd],
  );

  const currentHour = useCurrentHour();
  const currentSlotIdx = timeSlots.indexOf(`${String(currentHour).padStart(2, "0")}:00`);

  const summary = useMemo(() => calculateGridSummary(controlNocturno), [controlNocturno]);

  // Auto-scroll to current slot on mount
  useEffect(() => {
    const el = gridRef.current?.querySelector('[data-current-slot="true"]');
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentSlotIdx]);

  // Scroll to selected installation row
  useEffect(() => {
    if (selectedInstallationId && gridRef.current) {
      const row = gridRef.current.querySelector(
        `[data-installation-id="${selectedInstallationId}"]`,
      );
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("ring-1", "ring-cyan-500/40");
        setTimeout(() => row.classList.remove("ring-1", "ring-cyan-500/40"), 2000);
      }
    }
  }, [selectedInstallationId]);

  if (!controlNocturno) {
    return <GridEmptyState />;
  }

  const instalaciones = controlNocturno.instalaciones ?? [];

  return (
    <div className="flex flex-col h-full bg-[#080c16]">
      <GridHeaderBar
        totalInstalaciones={instalaciones.length}
        totalSlots={timeSlots.length}
        summary={summary}
        onExportPDF={handleExportPDF}
      />

      <div ref={gridRef} className="flex-1 overflow-auto scrollbar-thin">
        <table
          className="w-full text-[11px] border-collapse"
          style={{ fontFamily: "'JetBrains Mono', monospace", minWidth: "1200px" }}
        >
          <thead className="sticky top-0 z-20 bg-[#0a0f1c]">
            <tr>
              <th className="sticky left-0 z-30 bg-[#0a0f1c] w-8 px-2 py-2 text-left text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                #
              </th>
              <th className="sticky left-8 z-30 bg-[#0a0f1c] min-w-[160px] px-2 py-2 text-left text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                Instalaci&oacute;n
              </th>
              <th className="min-w-[140px] px-2 py-2 text-left text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                Gdia. Nocturno
              </th>
              <th className="w-14 px-2 py-2 text-center text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                Lleg.
              </th>
              {timeSlots.map((slot, i) => (
                <th
                  key={slot}
                  data-current-slot={i === currentSlotIdx}
                  className={`w-16 px-1 py-2 text-center font-medium text-[10px] ${
                    i === currentSlotIdx
                      ? "text-cyan-400 border-b-2 border-cyan-500"
                      : "text-[#475569]"
                  }`}
                >
                  <div className="text-[8px] text-[#475569] uppercase tracking-wider">R{i + 1}</div>
                  <div className="tabular-nums">{slot}</div>
                </th>
              ))}
              <th className="w-14 px-2 py-2 text-center text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                Lleg.
              </th>
              <th className="min-w-[120px] px-2 py-2 text-left text-[10px] text-[#475569] font-medium uppercase tracking-wider">
                Gdia. D&iacute;a
              </th>
            </tr>
          </thead>

          <tbody>
            {instalaciones.map((inst, rowIdx) => (
              <GridRow
                key={inst.id}
                index={rowIdx + 1}
                instalacion={inst}
                timeSlots={timeSlots}
                currentSlotIdx={currentSlotIdx}
                isSelected={selectedInstallationId === inst.installationId}
                onSelectInstallation={onSelectInstallation}
                onCellClick={onCellClick}
                onGuardClick={onGuardClick}
                onInstallationDetail={onInstallationDetail}
              />
            ))}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-[#0a0f1c]/95 backdrop-blur-sm border-t border-[#1a1f2e]">
            <GridSummaryRow
              timeSlots={timeSlots}
              instalaciones={instalaciones}
              summary={summary}
            />
          </tfoot>
        </table>
      </div>

      <GridNotesSection
        controlNocturnoId={controlNocturno.id}
        generalNotes={controlNocturno.generalNotes}
        instalaciones={instalaciones}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
