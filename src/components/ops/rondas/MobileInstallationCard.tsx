"use client";

import { cn } from "@/lib/utils";

interface CNRonda {
  id: string;
  rondaNumber: number;
  horaEsperada: string;
  horaMarcada: string | null;
  status: string;
  notes: string | null;
  autoPopulated: boolean;
  manualOverride: boolean;
  trustScore: number | null;
  rondaExpected: boolean;
}

interface CNGuardia {
  id: string;
  guardiaNombre: string;
  horaLlegada: string | null;
  isExtra: boolean;
  status: string;
  turno: string;
  notes?: string | null;
}

interface CNInstalacion {
  id: string;
  installationId: string | null;
  installationName: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  coberturaStatus: string;
  monitoreoType: string;
  notes: string | null;
  rondasEsperadas: number;
  rondaFrecuencia?: number | null;
  guardias: CNGuardia[];
  rondas: CNRonda[];
}

interface MobileInstallationCardProps {
  instalacion: CNInstalacion;
  expanded: boolean;
  onToggle: () => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
  isReadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusDot(status: string): string {
  switch (status) {
    case "presente": case "reemplazo": return "bg-status-ok";
    case "en_camino": return "bg-status-warn animate-pulse";
    case "no_viene": return "bg-status-danger";
    default: return "bg-slate-500";
  }
}

function coberturaBarColor(status: string): string {
  switch (status) {
    case "completa": return "bg-status-ok";
    case "parcial": return "bg-status-warn";
    case "descubierta": return "bg-status-danger";
    default: return "bg-slate-600";
  }
}

function getSlotVisual(slot: CNRonda, currentHour: number): {
  bg: string; color: string; icon: string; label: string;
} {
  const slotHour = parseInt(slot.horaEsperada.split(":")[0], 10);
  const normalizedSlot = slotHour < 12 ? slotHour + 24 : slotHour;
  const normalizedCurrent = currentHour < 12 ? currentHour + 24 : currentHour;
  const isPast = normalizedSlot < normalizedCurrent;
  const isCurrent = normalizedSlot === normalizedCurrent;

  if (slot.status === "completada" && slot.autoPopulated) {
    const t = slot.trustScore ?? 0;
    return {
      bg: t >= 80 ? "bg-status-ok-soft" : t >= 60 ? "bg-status-warn-soft" : "bg-status-danger-soft",
      color: t >= 80 ? "text-status-ok-fg" : t >= 60 ? "text-status-warn-fg" : "text-status-danger-fg",
      icon: "\u26A1",
      label: `${slot.horaMarcada}${t ? ` \u00B7 Trust ${t}` : ""}`,
    };
  }
  if (slot.status === "completada" && !slot.autoPopulated) {
    return { bg: "bg-status-ok-soft/50", color: "text-status-ok-fg", icon: "\u270B", label: slot.horaMarcada || "OK" };
  }
  if (slot.status === "omitida") {
    return { bg: "bg-status-danger-soft", color: "text-status-danger-fg", icon: "\u2715", label: slot.notes || "Omitida" };
  }
  if (slot.status === "no_aplica") {
    return { bg: "", color: "text-slate-600", icon: "\u2014", label: "N/A" };
  }
  // Pending
  if (isCurrent) {
    return { bg: "bg-status-info-soft/50", color: "text-status-info-fg", icon: "\u25CF", label: "Esperando..." };
  }
  if (isPast && slot.rondaExpected) {
    return { bg: "bg-status-danger-soft/50", color: "text-status-danger-fg", icon: "\u26A0", label: "No realizada" };
  }
  if (isPast && !slot.rondaExpected) {
    return { bg: "", color: "text-slate-700", icon: "\u00B7", label: "" };
  }
  if (slot.rondaExpected) {
    return { bg: "bg-slate-800/40", color: "text-slate-500", icon: "\u2014", label: "Programada" };
  }
  return { bg: "", color: "text-slate-700", icon: "", label: "" };
}

// ---------------------------------------------------------------------------
// Guard row component
// ---------------------------------------------------------------------------

function GuardRow({ g }: { g: CNGuardia }) {
  const isNoViene = g.status === "no_viene";
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg",
      isNoViene ? "bg-status-danger-soft" :
      g.status === "presente" || g.status === "reemplazo" ? "bg-status-ok-soft" :
      g.status === "en_camino" ? "bg-status-warn-soft" : "bg-slate-800/50"
    )}>
      <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", statusDot(g.status))} />
      <span className={cn(
        "text-xs flex-1 truncate",
        isNoViene ? "line-through text-status-danger-fg/60" : "text-slate-200"
      )}>
        {g.guardiaNombre}
      </span>
      {g.isExtra && (
        <span className="text-[8px] text-status-warn-fg font-bold bg-status-warn-soft px-1 rounded flex-shrink-0">EXT</span>
      )}
      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
        {isNoViene ? (
          <span className="text-status-danger-fg font-sans">
            No viene{g.notes ? ` \u00B7 ${g.notes}` : ""}
          </span>
        ) : g.horaLlegada ? g.horaLlegada : "\u2014"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard section header with count
// ---------------------------------------------------------------------------

function guardSummaryColor(guardias: CNGuardia[]): string {
  if (guardias.length === 0) return "text-slate-600";
  const presentes = guardias.filter(g => g.status === "presente" || g.status === "reemplazo").length;
  if (presentes >= guardias.length) return "text-status-ok-fg";
  if (guardias.some(g => g.status === "no_viene")) return "text-status-danger-fg";
  if (presentes > 0) return "text-status-warn-fg";
  return "text-slate-500";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MobileInstallationCard({
  instalacion,
  expanded,
  onToggle,
  onGuardClick,
  isReadOnly,
}: MobileInstallationCardProps) {
  const rondas = instalacion.rondas ?? [];
  const allGuardias = instalacion.guardias ?? [];
  const nocturnos = allGuardias.filter((g) => g.turno === "nocturno" || !g.turno);
  const diurnos = allGuardias.filter((g) => g.turno === "diurno");

  const completadas = rondas.filter((r) => r.status === "completada").length;
  const omitidas = rondas.filter((r) => r.status === "omitida").length;
  const expected = rondas.filter((r) => r.rondaExpected).length;
  const scores = rondas.filter((r) => r.trustScore != null && r.trustScore > 0);
  const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, r) => a + (r.trustScore ?? 0), 0) / scores.length) : null;

  const isDescubierta = instalacion.coberturaStatus === "descubierta";
  const currentHour = new Date().getHours();
  const nocPresentes = nocturnos.filter(g => g.status === "presente" || g.status === "reemplazo").length;
  const diaPresentes = diurnos.filter(g => g.status === "presente" || g.status === "reemplazo").length;

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      isDescubierta
        ? "bg-status-danger-soft/30 border-status-danger-border"
        : "bg-slate-800/50 border-slate-700/50"
    )}>
      {/* ═══ COLLAPSED HEADER ═══ */}
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-start gap-3 text-left">
        {/* Color bar */}
        <div className={cn("w-1.5 rounded-full self-stretch mt-0.5 flex-shrink-0", coberturaBarColor(instalacion.coberturaStatus))} />

        <div className="flex-1 min-w-0">
          {/* Name + type */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{instalacion.installationName}</span>
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {instalacion.monitoreoType === "rondas"
                ? `\uD83D\uDD04${instalacion.rondaFrecuencia ? ` c/${instalacion.rondaFrecuencia}m` : ""}`
                : "\uD83D\uDCDE"}
            </span>
          </div>

          {/* Dots de cobertura noche + día */}
          <div className="flex items-center gap-3 mt-1.5">
            {nocturnos.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-500">N:</span>
                <div className="flex gap-0.5">
                  {nocturnos.map((g) => (
                    <div key={g.id} className={cn("w-2 h-2 rounded-full", statusDot(g.status))} />
                  ))}
                </div>
              </div>
            )}
            {diurnos.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-500">D:</span>
                <div className="flex gap-0.5">
                  {diurnos.map((g) => (
                    <div key={g.id} className={cn("w-2 h-2 rounded-full", statusDot(g.status))} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1 text-[10px]">
            <span className="text-slate-400">{completadas}/{expected || rondas.length} check-ins</span>
            {avgTrust != null && (
              <span className={avgTrust >= 80 ? "text-status-ok-fg" : avgTrust >= 60 ? "text-status-warn-fg" : "text-status-danger-fg"}>
                Trust {avgTrust}
              </span>
            )}
            {omitidas > 0 && <span className="text-status-danger-fg">{omitidas} omitidas</span>}
          </div>

          {/* Note preview */}
          {instalacion.notes && (
            <div className="mt-1 text-[9px] text-status-warn-fg/70 truncate">{"\uD83D\uDCDD"} {instalacion.notes}</div>
          )}
        </div>

        {/* Right: badge + chevron */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isDescubierta && (
            <span className="text-[8px] text-status-danger-fg bg-status-danger-soft px-1.5 py-0.5 rounded font-bold">DESC</span>
          )}
          <span className={cn("text-slate-500 text-xs transition-transform duration-200", expanded && "rotate-180")}>{"\u25BE"}</span>
        </div>
      </button>

      {/* ═══ EXPANDED CONTENT ═══ */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">

          {/* ─── GUARDIAS NOCHE ─── */}
          <div onClick={() => onGuardClick?.(instalacion, "nocturno")} className={onGuardClick ? "cursor-pointer" : undefined}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Turno Noche</span>
              <span className={cn("text-[10px] font-bold", guardSummaryColor(nocturnos))}>
                {nocPresentes}/{nocturnos.length}
              </span>
            </div>
            {nocturnos.length > 0 ? (
              <div className="space-y-1.5">
                {nocturnos.map((g) => <GuardRow key={g.id} g={g} />)}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic px-3 py-2 bg-slate-800/30 rounded-lg">
                Sin guardias nocturnos asignados
              </div>
            )}
          </div>

          {/* ─── GUARDIAS DÍA ─── */}
          <div
            onClick={() => onGuardClick?.(instalacion, "diurno")}
            className={onGuardClick ? "cursor-pointer" : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Relevo D&iacute;a</span>
              <span className={cn("text-[10px] font-bold", guardSummaryColor(diurnos))}>
                {diurnos.length > 0
                  ? `${diaPresentes}/${diurnos.length}`
                  : "\u2014"}
              </span>
            </div>
            {diurnos.length > 0 ? (
              <div className="space-y-1.5">
                {diurnos.map((g) => <GuardRow key={g.id} g={g} />)}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
                <span className="text-[11px] text-slate-500 italic flex-1">Sin guardias de d&iacute;a asignados</span>
                {!isReadOnly && onGuardClick && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onGuardClick(instalacion, "diurno"); }}
                    className="text-[9px] text-status-info-fg font-medium px-2 py-0.5 rounded-full border border-status-info-border bg-status-info-soft"
                  >
                    + Asignar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ─── TIMELINE DE SLOTS ─── */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">
              {instalacion.monitoreoType === "rondas" ? "Rondas" : "Check-ins"}
            </div>
            <div className="space-y-1">
              {rondas.map((r) => {
                const v = getSlotVisual(r, currentHour);
                // Skip empty future non-expected slots
                if (!v.icon && !v.label) return null;
                return (
                  <div key={r.id} className={cn("flex items-center gap-2.5 px-3 py-1.5 rounded-lg", v.bg)}>
                    <span className="text-[11px] text-slate-500 font-mono w-12 flex-shrink-0">{r.horaEsperada}</span>
                    <span className={cn("text-xs", v.color)}>{v.icon}</span>
                    <span className={cn("text-xs flex-1", v.color)}>{v.label}</span>
                    {r.notes && <span className="text-status-info-fg text-[10px] flex-shrink-0">{"\uD83D\uDCAC"}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── NOTAS ─── */}
          {instalacion.notes && (
            <div className="bg-status-warn-soft border border-status-warn-border rounded-lg px-3 py-2">
              <div className="text-[10px] text-status-warn-fg/80">{instalacion.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
