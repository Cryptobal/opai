"use client";

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Users, Shield, AlertTriangle, Clock, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrustScoreGauge } from "./TrustScoreGauge";

interface Guard {
  id: string;
  guardiaNombre: string;
  horaLlegada: string | null;
  status: string;
  turno: string;
}

interface Installation {
  id: string;
  installationId: string | null;
  installationName: string;
  coberturaStatus: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  guardias: Guard[];
  rondas: Array<{
    id: string;
    status: string;
    horaMarcada: string | null;
    horaEsperada: string;
    trustScore: number | null;
    rondaExpected: boolean;
  }>;
  installation: { id: string; name: string; lat: number | null; lng: number | null } | null;
}

interface AlertRow {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  createdAt: string;
  installation?: { id: string; name: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  instalacion: Installation | null;
  alertRows: AlertRow[];
}

function guardStatusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    presente: { label: "Presente", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    reemplazo: { label: "Reemplazo", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
    en_camino: { label: "En camino", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    no_viene: { label: "No viene", color: "text-red-400 bg-red-500/10 border-red-500/20" },
    pendiente: { label: "Pendiente", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  };
  const s = map[status] ?? map.pendiente;
  return (
    <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", s.color)}>
      {s.label}
    </span>
  );
}

function severityColor(sev: string) {
  if (sev === "critical") return "border-l-red-500 bg-red-500/5";
  if (sev === "warning") return "border-l-amber-500 bg-amber-500/5";
  return "border-l-cyan-500 bg-cyan-500/5";
}

function coberturaLabel(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    completa: { label: "Completa", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    parcial: { label: "Parcial", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    descubierta: { label: "Descubierta", color: "text-red-400 bg-red-500/10 border-red-500/20" },
    pendiente: { label: "Pendiente", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  };
  const s = map[status] ?? map.pendiente;
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border", s.color)}>
      {s.label}
    </span>
  );
}

export function InstallationDetailModal({ open, onClose, instalacion, alertRows }: Props) {
  if (!instalacion) return null;

  const instAlerts = useMemo(() => {
    const instId = instalacion.installationId ?? instalacion.installation?.id;
    return alertRows.filter((a) => !a.resuelta && a.installation?.id === instId).slice(0, 10);
  }, [alertRows, instalacion]);

  const completedRondas = (instalacion.rondas ?? []).filter((r) => r.status === "completada");
  const trustScores = completedRondas.filter((r) => r.trustScore != null).map((r) => r.trustScore!);
  const avgTrust = trustScores.length > 0 ? Math.round(trustScores.reduce((a, b) => a + b, 0) / trustScores.length) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-[#0a0f1c] border-[#1a1f2e] p-0 gap-0 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-[#1a1f2e]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px] font-semibold text-[#f1f5f9] flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-400" />
              {instalacion.installationName}
            </DialogTitle>
            {coberturaLabel(instalacion.coberturaStatus)}
          </div>
          {instalacion.installation?.lat && (
            <p className="text-[10px] text-[#64748b] mt-1 tabular-nums">
              {instalacion.installation.lat.toFixed(5)}, {instalacion.installation.lng?.toFixed(5)}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Guards section */}
          <section>
            <h4 className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Guardias ({instalacion.guardiasPresentes}/{instalacion.guardiasRequeridos})
            </h4>
            <div className="space-y-1.5">
              {(instalacion.guardias ?? []).map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-lg bg-[#111827] border border-[#1a1f2e] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#f1f5f9]">{g.guardiaNombre}</span>
                    <span className="text-[9px] text-[#64748b] uppercase">{g.turno}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {g.horaLlegada && (
                      <span className="text-[10px] text-[#94a3b8] tabular-nums">{g.horaLlegada}</span>
                    )}
                    {guardStatusBadge(g.status)}
                  </div>
                </div>
              ))}
              {(instalacion.guardias ?? []).length === 0 && (
                <p className="text-[11px] text-[#64748b] italic">Sin guardias asignados</p>
              )}
            </div>
          </section>

          {/* Rondas section */}
          <section>
            <h4 className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              Rondas ({completedRondas.length} completadas)
              {avgTrust !== null && (
                <span className="ml-auto">
                  <TrustScoreGauge score={avgTrust} size="sm" />
                </span>
              )}
            </h4>
            <div className="grid grid-cols-6 gap-1">
              {(instalacion.rondas ?? []).filter((r) => r.rondaExpected).map((r) => {
                const isCompleted = r.status === "completada";
                const isOmitted = r.status === "omitida";
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "rounded px-1.5 py-1 text-center border",
                      isCompleted && "bg-emerald-500/10 border-emerald-500/20",
                      isOmitted && "bg-red-500/10 border-red-500/20",
                      !isCompleted && !isOmitted && "bg-[#111827] border-[#1a1f2e]",
                    )}
                    title={`${r.horaEsperada} — ${r.status}${r.trustScore ? ` (Trust: ${r.trustScore})` : ""}`}
                  >
                    <div className="text-[9px] text-[#64748b] tabular-nums">{r.horaEsperada}</div>
                    {r.horaMarcada && (
                      <div className={cn("text-[10px] font-medium tabular-nums", isCompleted ? "text-emerald-400" : "text-red-400")}>
                        {r.horaMarcada}
                      </div>
                    )}
                    {!r.horaMarcada && (
                      <div className="text-[10px] text-zinc-600">
                        {isOmitted ? <X className="h-3 w-3 mx-auto" /> : "\u2014"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Alerts section */}
          {instAlerts.length > 0 && (
            <section>
              <h4 className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Alertas activas ({instAlerts.length})
              </h4>
              <div className="space-y-1">
                {instAlerts.map((a) => (
                  <div
                    key={a.id}
                    className={cn("rounded-lg border-l-[3px] border border-[#1a1f2e] px-3 py-2", severityColor(a.severidad))}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#f1f5f9]">{a.mensaje}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-[#64748b] uppercase">{a.tipo.replace(/_/g, " ")}</span>
                      <span className="text-[9px] text-[#475569] tabular-nums">
                        {new Date(a.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
