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
}

interface MonitoreoGridProps {
  controlNocturno: ControlNocturnoData | null;
  turnoId: string | null;
  selectedInstallationId: string | null;
  onSelectInstallation: (id: string | null) => void;
  onCellClick?: (data: CellModalData) => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
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
  if (score == null) return "bg-slate-800/40";
  if (score >= 80) return "bg-emerald-500/20 border-emerald-500/40";
  if (score >= 60) return "bg-amber-500/18 border-amber-500/35";
  return "bg-red-500/18 border-red-500/35";
}

function trustTextColor(score: number | null): string {
  if (score == null) return "text-slate-500";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
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
    bg: "bg-slate-800/10",
    border: "border-none",
    icon: "",
    textColor: "text-slate-400",
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
      return { ...base, bg: "bg-emerald-500/15 border-emerald-500/25", border: "border border-solid", icon: "\u270B", textColor: "text-emerald-400" };
    }
    if (ronda.status === "omitida") {
      return { ...base, bg: "bg-red-500/20 border-red-500/35", border: "border border-solid", icon: "\u2715", textColor: "text-red-400" };
    }
    if (ronda.status === "no_aplica") {
      return { ...base, bg: "bg-slate-800/20", border: "border border-dashed border-slate-700/30", icon: "\u2014", textColor: "text-slate-600", subtle: true };
    }
    if (ronda.status === "pendiente" && isPastSlot) {
      return { ...base, bg: "bg-red-500/10 border-red-500/20", border: "border border-solid", icon: "\u26A0", textColor: "text-red-400" };
    }
    if (ronda.status === "pendiente" && isCurrentSlot) {
      return { ...base, bg: "bg-teal-500/5 border-teal-500/20", border: "border border-solid", pulse: true };
    }
    // Future with expected ronda
    return { ...base, bg: "bg-slate-800/40 border-slate-700/30", border: "border border-solid" };
  }

  // CELL WITHOUT EXPECTED RONDA (manual check-in)
  if (ronda.status === "completada") {
    return { ...base, bg: "bg-emerald-500/8 border-emerald-500/15", border: "border border-dashed", icon: "\u270B", textColor: "text-emerald-400" };
  }
  if (ronda.status === "omitida") {
    return { ...base, bg: "bg-amber-500/10 border-amber-500/20", border: "border border-dashed", icon: "\u270B\uD83D\uDCDD", textColor: "text-amber-400" };
  }
  if (isPastSlot) {
    return { ...base, bg: "bg-slate-800/15", icon: "\u00B7", subtle: true, textColor: "text-slate-700" };
  }
  // Future without expected ronda
  return { ...base, bg: "bg-slate-800/10", subtle: true, textColor: "text-slate-700" };
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
}: {
  index: number;
  instalacion: CNInstalacion;
  timeSlots: string[];
  currentSlotIdx: number;
  isSelected: boolean;
  onSelectInstallation: (id: string | null) => void;
  onCellClick?: (data: CellModalData) => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
}) {
  const currentHour = new Date().getHours();

  const nocturnos = (instalacion.guardias ?? []).filter((g) => g.turno === "nocturno" || !g.turno);
  const diurnos = (instalacion.guardias ?? []).filter((g) => g.turno === "diurno");

  const cobertura = instalacion.coberturaStatus ?? "pendiente";
  const isDescubierta = cobertura === "descubierta";

  const rowBg = isDescubierta
    ? "bg-red-500/[0.08] border-l-[4px] border-l-red-500"
    : isSelected
      ? "bg-teal-500/[0.06] ring-1 ring-inset ring-teal-500/30"
      : "";

  // First present guard's hora for the read-only Lleg. columns
  const primerLlegadaNoche = nocturnos.find((g) => g.horaLlegada && (g.status === "presente" || g.status === "reemplazo"))?.horaLlegada;
  const primerLlegadaDia = diurnos.find((g) => g.horaLlegada && (g.status === "presente" || g.status === "reemplazo"))?.horaLlegada;

  return (
    <tr
      data-installation-id={instalacion.installationId}
      className={`border-b border-slate-800/50 transition-colors hover:bg-slate-800/30 ${rowBg}`}
    >
      {/* # */}
      <td className="sticky left-0 z-10 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-600 font-mono">
        {index}
      </td>

      {/* Installation name */}
      <td className="sticky left-8 z-10 bg-slate-900 px-2 py-1.5">
        <button
          onClick={() => onSelectInstallation(
            isSelected ? null : instalacion.installationId,
          )}
          className="text-left group"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]">
              {instalacion.monitoreoType === "rondas" ? "\uD83D\uDD04" : "\uD83D\uDCDE"}
            </span>
            <span className="text-[11px] font-medium text-slate-200 group-hover:text-teal-400 transition-colors truncate max-w-[140px]">
              {instalacion.installationName}
            </span>
          </div>
          {instalacion.statusInstalacion !== "normal" && (
            <div className="text-[9px] mt-0.5">
              <span className={
                instalacion.statusInstalacion === "critico" ? "text-red-400" : "text-amber-400"
              }>
                {instalacion.statusInstalacion === "critico" ? "\u26A0\uFE0F" : "\u2139\uFE0F"} {instalacion.statusInstalacion}
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
        <span className="text-[10px] font-mono text-slate-400">
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

        const slotHour = parseInt(slot.split(":")[0], 10);
        const isCurrentSlot = i === currentSlotIdx;
        const isPastSlot = (() => {
          if (currentSlotIdx >= 0) return i < currentSlotIdx;
          if (slotHour >= 20) return currentHour < 20 || currentHour >= slotHour;
          return currentHour > slotHour || currentHour >= 20;
        })();

        const state = getCellState(ronda, isCurrentSlot, isPastSlot);

        return (
          <td key={slot} className={`px-0.5 py-1 ${isCurrentSlot ? "bg-teal-500/[0.03]" : ""}`}>
            <div
              onClick={() => onCellClick?.({
                ronda,
                installationName: instalacion.installationName,
                installationId: instalacion.installationId,
              })}
              className={`rounded ${state.border} px-1 py-1 text-center cursor-pointer
                min-h-[36px] flex flex-col items-center justify-center transition-all
                hover:scale-105 hover:z-10 ${state.bg} ${state.pulse ? "animate-pulse" : ""}`}
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
        <span className="text-[10px] font-mono text-slate-400">
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
        <span className="text-xs text-slate-400 font-semibold">RESUMEN</span>
        <span className="text-[10px] text-slate-500 ml-2">
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
            <div className="text-[9px] text-slate-500">
              {completed}/{expected > 0 ? expected : "\u2014"}
            </div>
            {avgTrust !== null && (
              <div className={`text-[8px] font-medium ${
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
    <div className="flex flex-col items-center justify-center h-full gap-4 py-12 bg-slate-900/50">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
        <span className="text-3xl">\uD83D\uDCCB</span>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-medium text-slate-300">Grid Operativo</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Inicia un turno para ver la planilla de control. Las rondas se auto-poblar&aacute;n
          y podr&aacute;s registrar check-ins manuales para instalaciones sin rondas.
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
  showNotes,
  onToggleNotes,
  isSaving,
  onExportPDF,
}: {
  totalInstalaciones: number;
  totalSlots: number;
  summary: { completadas: number; omitidas: number; cumplimiento: number };
  showNotes: boolean;
  onToggleNotes: () => void;
  isSaving?: boolean;
  onExportPDF?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-300">GRID OPERATIVO</span>
        <span className="text-[10px] text-slate-500">
          {totalInstalaciones} instalaciones &middot; {totalSlots} slots
        </span>
        {isSaving && (
          <div className="flex items-center gap-1.5 text-[10px] text-teal-400/60">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Guardando
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-emerald-400">{summary.completadas} completadas</span>
        {summary.omitidas > 0 && (
          <span className="text-[10px] text-red-400">{summary.omitidas} omitidas</span>
        )}
        <span className={`text-[10px] font-semibold ${
          summary.cumplimiento >= 80 ? "text-emerald-400"
          : summary.cumplimiento >= 60 ? "text-amber-400"
          : "text-red-400"
        }`}>
          {summary.cumplimiento}%
        </span>
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-slate-400 hover:text-white transition-colors"
          >
            {"\uD83D\uDCC4"} PDF
          </button>
        )}
        <button
          onClick={onToggleNotes}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            showNotes ? "bg-teal-500/20 text-teal-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Notas
        </button>
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
    <div className="border-t border-slate-800 px-4 py-3 bg-slate-950/50 flex-shrink-0">
      <div className="text-[10px] font-semibold text-slate-400 mb-2">NOTAS GENERALES</div>
      <textarea
        value={notes}
        onChange={isReadOnly ? undefined : (e) => handleChange(e.target.value)}
        readOnly={isReadOnly}
        rows={2}
        className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none resize-none ${isReadOnly ? "opacity-60 cursor-default" : ""}`}
        placeholder="Notas generales del turno..."
      />

      {instalaciones.filter((i) => i.notes).length > 0 && (
        <>
          <div className="mt-3 text-[10px] font-semibold text-slate-400 mb-2">
            COMENTARIOS POR INSTALACION
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin">
            {instalaciones
              .filter((i) => i.notes)
              .map((inst, idx) => (
                <div key={inst.id} className="flex gap-2 text-[10px]">
                  <span className="text-slate-500 font-medium min-w-[120px]">
                    {idx + 1}. {inst.installationName}
                  </span>
                  <span className="text-slate-400">{inst.notes}</span>
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
  isReadOnly,
}: MonitoreoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [showNotes, setShowNotes] = useState(false);
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
        row.classList.add("ring-1", "ring-teal-500/50");
        setTimeout(() => row.classList.remove("ring-1", "ring-teal-500/50"), 2000);
      }
    }
  }, [selectedInstallationId]);

  if (!controlNocturno) {
    return <GridEmptyState />;
  }

  const instalaciones = controlNocturno.instalaciones ?? [];

  return (
    <div className="flex flex-col h-full bg-slate-900/80">
      <GridHeaderBar
        totalInstalaciones={instalaciones.length}
        totalSlots={timeSlots.length}
        summary={summary}
        showNotes={showNotes}
        onToggleNotes={() => setShowNotes(!showNotes)}
        onExportPDF={handleExportPDF}
      />

      <div ref={gridRef} className="flex-1 overflow-auto scrollbar-thin">
        <table
          className="w-full text-[11px] border-collapse"
          style={{ fontFamily: "'JetBrains Mono', monospace", minWidth: "1200px" }}
        >
          <thead className="sticky top-0 z-20 bg-slate-900">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-900 w-8 px-2 py-2 text-left text-slate-500 font-medium">
                #
              </th>
              <th className="sticky left-8 z-30 bg-slate-900 min-w-[160px] px-2 py-2 text-left text-slate-500 font-medium">
                Instalaci&oacute;n
              </th>
              <th className="min-w-[140px] px-2 py-2 text-left text-slate-500 font-medium">
                Guardia Nocturno
              </th>
              <th className="w-14 px-2 py-2 text-center text-slate-500 font-medium">
                Lleg.
              </th>
              {timeSlots.map((slot, i) => (
                <th
                  key={slot}
                  data-current-slot={i === currentSlotIdx}
                  className={`w-16 px-1 py-2 text-center font-medium ${
                    i === currentSlotIdx ? "bg-teal-500/10 text-teal-400" : "text-slate-500"
                  }`}
                >
                  <div className="text-[9px] text-slate-600">R{i + 1}</div>
                  <div>{slot}</div>
                </th>
              ))}
              <th className="w-14 px-2 py-2 text-center text-slate-500 font-medium">
                Lleg.
              </th>
              <th className="min-w-[120px] px-2 py-2 text-left text-slate-500 font-medium">
                Guardia D&iacute;a
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
              />
            ))}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur-sm border-t-2 border-slate-700">
            <GridSummaryRow
              timeSlots={timeSlots}
              instalaciones={instalaciones}
              summary={summary}
            />
          </tfoot>
        </table>
      </div>

      {showNotes && (
        <GridNotesSection
          controlNocturnoId={controlNocturno.id}
          generalNotes={controlNocturno.generalNotes}
          instalaciones={instalaciones}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  );
}
