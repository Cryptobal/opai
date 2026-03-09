"use client";

import { ChevronDown } from "lucide-react";
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
  guardias: CNGuardia[];
  rondas: CNRonda[];
}

interface MobileInstallationCardProps {
  instalacion: CNInstalacion;
  expanded: boolean;
  onToggle: () => void;
  onGuardClick?: (instalacion: CNInstalacion, turno: "nocturno" | "diurno") => void;
}

function trustColor(score: number | null): string {
  if (score == null) return "text-slate-500";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function coberturaColor(status: string): string {
  switch (status) {
    case "completa": return "bg-emerald-500";
    case "parcial": return "bg-amber-500";
    case "descubierta": return "bg-red-500";
    default: return "bg-slate-600";
  }
}

function slotColor(ronda: CNRonda): string {
  if (ronda.status === "completada") {
    if (ronda.trustScore != null && ronda.trustScore >= 80) return "bg-emerald-500";
    if (ronda.trustScore != null && ronda.trustScore >= 60) return "bg-amber-500";
    if (ronda.trustScore != null) return "bg-red-500";
    return "bg-emerald-500/60";
  }
  if (ronda.status === "omitida") return "bg-red-500";
  if (ronda.status === "no_aplica") return "bg-slate-700";
  return "bg-slate-700/50";
}

function guardStatusDot(status: string): string {
  switch (status) {
    case "presente": return "bg-emerald-500";
    case "reemplazo": return "bg-emerald-500";
    case "en_camino": return "bg-amber-500 animate-pulse";
    case "no_viene": return "bg-red-500";
    default: return "bg-slate-600";
  }
}

function rondaTimelineIcon(ronda: CNRonda): { icon: string; color: string; label: string } {
  if (ronda.status === "completada" && ronda.autoPopulated) {
    return {
      icon: "\u26A1",
      color: "text-emerald-400",
      label: `${ronda.horaMarcada}${ronda.trustScore != null ? ` · Trust ${ronda.trustScore}` : ""}`,
    };
  }
  if (ronda.status === "completada" && !ronda.autoPopulated) {
    return {
      icon: "\u270B",
      color: "text-emerald-300",
      label: ronda.horaMarcada ?? "Manual",
    };
  }
  if (ronda.status === "omitida") {
    return { icon: "\u2715", color: "text-red-400", label: "Omitida" };
  }
  if (ronda.status === "no_aplica") {
    return { icon: "\u2014", color: "text-slate-600", label: "N/A" };
  }
  // Pending — determine if past, current, or future
  const now = new Date();
  const currentHour = now.getHours();
  const slotHour = parseInt(ronda.horaEsperada.split(":")[0], 10);

  // Normalize for overnight shifts (19:00 → 08:00)
  const normalizedCurrent = currentHour < 12 ? currentHour + 24 : currentHour;
  const normalizedSlot = slotHour < 12 ? slotHour + 24 : slotHour;
  const isPastSlot = normalizedSlot < normalizedCurrent;
  const isCurrentSlot = slotHour === currentHour;

  if (isCurrentSlot) {
    return { icon: "\u25CF", color: "text-teal-400 animate-pulse", label: "Esperando..." };
  }
  if (isPastSlot) {
    if (ronda.rondaExpected) {
      return { icon: "\u26A0", color: "text-red-400", label: "No realizada" };
    }
    // Manual slot that wasn't checked — subtle, not alarming
    return { icon: "\u00B7", color: "text-slate-700", label: "" };
  }
  // Future
  if (ronda.rondaExpected) {
    return { icon: "\u2014", color: "text-slate-600", label: "Programada" };
  }
  return { icon: "\u00B7", color: "text-slate-700", label: "" };
}

function guardSectionSummary(guardias: CNGuardia[], requeridos: number) {
  const presentes = guardias.filter(
    (g) => g.status === "presente" || g.status === "reemplazo",
  ).length;
  if (presentes >= requeridos) return { text: `${presentes}/${requeridos} ✅`, color: "text-emerald-400" };
  const allPending = guardias.every((g) => g.status === "pendiente" || g.status === "en_camino");
  if (allPending) return { text: `${presentes}/${requeridos} ⏳`, color: "text-slate-400" };
  return { text: `${presentes}/${requeridos} 🔴`, color: "text-red-400" };
}

function GuardiaSection({
  label,
  guardias,
  requeridos,
}: {
  label: string;
  guardias: CNGuardia[];
  requeridos: number;
}) {
  if (guardias.length === 0) return null;
  const summary = guardSectionSummary(guardias, requeridos);

  return (
    <div className="mt-2 mb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] text-slate-500 font-semibold uppercase">{label}</span>
        <span className={cn("text-[9px] font-semibold", summary.color)}>{summary.text}</span>
      </div>
      <div className="space-y-1">
        {guardias.map((g) => {
          const isNoViene = g.status === "no_viene";
          return (
            <div key={g.id} className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full flex-shrink-0", guardStatusDot(g.status))} />
              <span
                className={cn(
                  "text-xs truncate",
                  isNoViene ? "text-red-400 line-through" : "text-slate-300",
                )}
              >
                {g.guardiaNombre}
              </span>
              {g.isExtra && (
                <span className="text-[8px] font-bold text-amber-400 border border-amber-400/40 rounded px-1 leading-tight flex-shrink-0">
                  EXT
                </span>
              )}
              <span className="ml-auto flex-shrink-0 text-[10px] text-slate-500">
                {isNoViene ? (
                  <span className="text-red-400">
                    — No viene{g.notes ? ` · ${g.notes}` : ""}
                  </span>
                ) : g.horaLlegada ? (
                  g.horaLlegada
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MobileInstallationCard({ instalacion, expanded, onToggle, onGuardClick }: MobileInstallationCardProps) {
  const rondas = instalacion.rondas ?? [];
  const completadas = rondas.filter((r) => r.status === "completada").length;
  const omitidas = rondas.filter((r) => r.status === "omitida").length;
  const expected = rondas.filter((r) => r.rondaExpected).length;
  const scores = rondas.filter((r) => r.trustScore != null);
  const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, r) => a + (r.trustScore ?? 0), 0) / scores.length) : null;
  const isDescubierta = instalacion.coberturaStatus === "descubierta";
  const allGuardias = instalacion.guardias ?? [];
  const nocturnos = allGuardias.filter((g) => g.turno === "nocturno" || !g.turno);
  const diurnos = allGuardias.filter((g) => g.turno === "diurno");

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all",
        isDescubierta
          ? "border-red-500/40 bg-red-500/[0.06]"
          : "border-slate-800 bg-slate-900/60"
      )}
    >
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {/* Color bar */}
        <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", coberturaColor(instalacion.coberturaStatus))} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">
              {instalacion.monitoreoType === "rondas" ? "\uD83D\uDD04" : "\uD83D\uDCDE"}
            </span>
            <span className="text-xs font-medium text-slate-200 truncate">
              {instalacion.installationName}
            </span>
          </div>

          {/* Mini slot bar */}
          <div className="flex gap-[2px] mt-1.5">
            {rondas.map((r) => (
              <div
                key={r.id}
                className={cn("h-[3px] flex-1 rounded-full", slotColor(r))}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-slate-400">
              {completadas}/{expected || rondas.length}
            </div>
            {avgTrust != null && (
              <div className={cn("text-[10px] font-bold", trustColor(avgTrust))}>
                T{avgTrust}
              </div>
            )}
          </div>
          {omitidas > 0 && (
            <span className="text-[9px] text-red-400 font-medium">{omitidas} om</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-500 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-800/50">
          {/* Guards section — Noche */}
          <div onClick={() => onGuardClick?.(instalacion, "nocturno")} className="cursor-pointer">
            <GuardiaSection
              label="TURNO NOCHE"
              guardias={nocturnos}
              requeridos={instalacion.guardiasRequeridos}
            />
          </div>

          {/* Guards section — Día (Relevo) */}
          {diurnos.length > 0 ? (
            <div onClick={() => onGuardClick?.(instalacion, "diurno")} className="cursor-pointer">
              <GuardiaSection
                label="RELEVO DÍA"
                guardias={diurnos}
                requeridos={diurnos.length}
              />
            </div>
          ) : (
            <div className="mt-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 font-semibold uppercase">
                  RELEVO DÍA — Pendiente de asignar
                </span>
                {onGuardClick && (
                  <button
                    onClick={() => onGuardClick(instalacion, "diurno")}
                    className="text-[9px] text-teal-400 font-medium px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10"
                  >
                    + Asignar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="text-[9px] text-slate-500 font-semibold uppercase mb-1.5">Rondas</div>
          <div className="space-y-1">
            {rondas.map((r) => {
              const timeline = rondaTimelineIcon(r);
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono w-10 flex-shrink-0">
                    {r.horaEsperada}
                  </span>
                  <span className={cn("text-xs", timeline.color)}>
                    {timeline.icon}
                  </span>
                  <span className={cn("text-[11px]", timeline.color)}>
                    {timeline.label}
                  </span>
                  {r.notes && <span className="text-blue-400 text-[10px] ml-auto">{"\uD83D\uDCAC"}</span>}
                </div>
              );
            })}
          </div>

          {/* Notes */}
          {instalacion.notes && (
            <div className="mt-2 px-2 py-1.5 rounded-lg bg-slate-800/50 text-[11px] text-slate-400">
              {instalacion.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
