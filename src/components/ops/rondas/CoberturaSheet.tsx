"use client";

import { Moon, Sun, Send, Loader2, Users, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface Guard {
  id: string;
  guardiaNombre: string;
  horaLlegada: string | null;
  status: string;
  turno: string;
}

interface Installation {
  id: string;
  installationName: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  coberturaStatus: string;
  guardias: Guard[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  turnoFilter: "nocturno" | "diurno";
  instalaciones: Installation[];
  onSendCobertura: (turnoFilter: "nocturno" | "diurno") => void;
  sendingEmail: "nocturno" | "diurno" | null;
}

function coberturaColor(status: string) {
  if (status === "completa") return { dot: "bg-status-ok", text: "text-status-ok-fg", bg: "bg-status-ok-soft/50", border: "border-status-ok-border" };
  if (status === "parcial") return { dot: "bg-status-warn", text: "text-status-warn-fg", bg: "bg-status-warn-soft/50", border: "border-status-warn-border" };
  if (status === "descubierta") return { dot: "bg-status-danger", text: "text-status-danger-fg", bg: "bg-status-danger-soft/50", border: "border-status-danger-border" };
  return { dot: "bg-zinc-600", text: "text-zinc-400", bg: "bg-zinc-500/8", border: "border-zinc-500/20" };
}

function guardStatusIcon(status: string) {
  if (status === "presente" || status === "reemplazo") return <Check className="h-3 w-3 text-status-ok-fg" />;
  if (status === "no_viene") return <X className="h-3 w-3 text-status-danger-fg" />;
  if (status === "en_camino") return <Loader2 className="h-3 w-3 text-status-warn-fg animate-spin" />;
  return <span className="w-3 h-3 rounded-full bg-zinc-600 inline-block" />;
}

export function CoberturaSheet({ open, onClose, turnoFilter, instalaciones, onSendCobertura, sendingEmail }: Props) {
  const isNocturno = turnoFilter === "nocturno";
  const Icon = isNocturno ? Moon : Sun;
  const label = isNocturno ? "nocturna" : "diurna";

  // Filter guards by turno type
  const filteredInstalls = instalaciones.map((inst) => {
    const guards = (inst.guardias ?? []).filter((g) =>
      isNocturno ? (g.turno === "nocturno" || !g.turno) : g.turno === "diurno",
    );
    const presentes = guards.filter((g) => g.status === "presente" || g.status === "reemplazo").length;
    return { ...inst, guards, presentes };
  });

  const totalInst = filteredInstalls.length;
  const descubiertas = filteredInstalls.filter((i) => i.presentes === 0).length;
  const completas = filteredInstalls.filter((i) => i.presentes >= i.guardiasRequeridos).length;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[380px] bg-[#0a0f1c] border-l border-[#1a1f2e] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[#1a1f2e]">
          <SheetTitle className="flex items-center gap-2 text-[#f1f5f9]">
            <Icon className={cn("h-4 w-4", isNocturno ? "text-status-info-fg" : "text-status-warn-fg")} />
            <span className="text-[14px] font-semibold">Cobertura {label}</span>
          </SheetTitle>
          {/* Summary badges */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">{totalInst} instalaciones</span>
            <span className="text-[10px] text-status-ok-fg tabular-nums">{completas} completas</span>
            {descubiertas > 0 && (
              <span className="text-[10px] text-status-danger-fg tabular-nums">{descubiertas} descubiertas</span>
            )}
          </div>
        </SheetHeader>

        {/* Installation list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-thin">
          {filteredInstalls.map((inst) => {
            const colors = coberturaColor(
              inst.presentes >= inst.guardiasRequeridos ? "completa"
                : inst.presentes > 0 ? "parcial"
                  : "descubierta",
            );
            return (
              <div
                key={inst.id}
                className={cn("rounded-lg border px-3 py-2.5", colors.bg, colors.border)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.dot)} />
                    <span className="text-[12px] font-medium text-[#f1f5f9] truncate">
                      {inst.installationName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Users className="h-3 w-3 text-[#64748b]" />
                    <span className={cn("text-[11px] font-bold tabular-nums", colors.text)}>
                      {inst.presentes}/{inst.guardiasRequeridos}
                    </span>
                  </div>
                </div>
                {inst.guards.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 pl-3.5">
                    {inst.guards.map((g) => (
                      <div key={g.id} className="flex items-center gap-1.5 text-[10px]">
                        {guardStatusIcon(g.status)}
                        <span className="text-[#94a3b8] truncate">{g.guardiaNombre}</span>
                        {g.horaLlegada && (
                          <span className="text-[#64748b] tabular-nums ml-auto">{g.horaLlegada}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {inst.guards.length === 0 && (
                  <div className="mt-1 pl-3.5 flex items-center gap-1 text-[10px] text-status-danger-fg/70">
                    <AlertTriangle className="h-3 w-3" />
                    Sin guardias asignados
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Send button */}
        <div className="px-5 py-4 border-t border-[#1a1f2e]">
          <Button
            className={cn(
              "w-full gap-2",
              isNocturno
                ? "bg-status-info hover:brightness-110 text-white"
                : "bg-status-warn hover:brightness-110 text-white",
            )}
            onClick={() => onSendCobertura(turnoFilter)}
            disabled={!!sendingEmail}
          >
            {sendingEmail === turnoFilter ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar cobertura {label}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
