"use client";

import { useState } from "react";
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
  // Pending
  const now = new Date();
  const currentHour = now.getHours();
  const slotHour = parseInt(ronda.horaEsperada.split(":")[0], 10);
  const isCurrentSlot = slotHour === currentHour;
  if (isCurrentSlot) {
    return { icon: "\u25CF", color: "text-teal-400 animate-pulse", label: "Esperando..." };
  }
  return { icon: "\u2014", color: "text-slate-600", label: "Programada" };
}

export function MobileInstallationCard({ instalacion, expanded, onToggle }: MobileInstallationCardProps) {
  const rondas = instalacion.rondas ?? [];
  const completadas = rondas.filter((r) => r.status === "completada").length;
  const omitidas = rondas.filter((r) => r.status === "omitida").length;
  const expected = rondas.filter((r) => r.rondaExpected).length;
  const scores = rondas.filter((r) => r.trustScore != null);
  const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, r) => a + (r.trustScore ?? 0), 0) / scores.length) : null;
  const isDescubierta = instalacion.coberturaStatus === "descubierta";
  const nocturnos = (instalacion.guardias ?? []).filter((g) => g.turno === "nocturno" || !g.turno);

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
          {/* Guards section */}
          {nocturnos.length > 0 && (
            <div className="mt-2 mb-3">
              <div className="text-[9px] text-slate-500 font-semibold uppercase mb-1.5">Guardias Noche</div>
              <div className="space-y-1">
                {nocturnos.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", guardStatusDot(g.status))} />
                    <span className="text-xs text-slate-300 truncate">{g.guardiaNombre}</span>
                    {g.horaLlegada && (
                      <span className="text-[10px] text-slate-500 ml-auto">{g.horaLlegada}</span>
                    )}
                    {g.status === "no_viene" && (
                      <span className="text-[9px] text-red-400 ml-auto">No viene</span>
                    )}
                  </div>
                ))}
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
