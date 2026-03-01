"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Phone, AlertTriangle } from "lucide-react";
import { RondaProgress } from "@/components/ops/rondas/ronda-progress";
import { TrustScoreBadge } from "@/components/ops/rondas/trust-score-badge";
import { cn } from "@/lib/utils";

interface GuardRonda {
  id: string;
  templateName: string;
  installationName: string;
  guardiaNombre: string;
  guardiaPhone?: string | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  trustScore: number;
  startedAt: string;
  status: string;
  alerts: Array<{ id: string; tipo: string; severidad: string; mensaje: string }>;
  marcaciones: Array<{
    checkpointName?: string;
    timestamp: string;
    lat?: number | null;
    lng?: number | null;
    fotoEvidenciaUrl?: string | null;
  }>;
}

interface Props {
  rondas: GuardRonda[];
  onSelectGuard: (rondaId: string) => void;
  selectedId: string | null;
}

export function MonitoreoGuardPanel({ rondas, onSelectGuard, selectedId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
      <h3 className="text-sm font-semibold px-1">Guardias en turno</h3>

      {rondas.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          No hay rondas activas en este momento.
        </div>
      )}

      {rondas.map((r) => {
        const isExpanded = expandedId === r.id;
        const hasAlerts = r.alerts.length > 0;

        return (
          <div
            key={r.id}
            className={cn(
              "rounded-lg border bg-card p-3 transition-all cursor-pointer",
              selectedId === r.id ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
              hasAlerts && "border-red-500/30",
            )}
            onClick={() => onSelectGuard(r.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{r.guardiaNombre}</p>
                  <TrustScoreBadge score={r.trustScore} />
                </div>
                <p className="text-[11px] text-muted-foreground">{r.installationName}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className="text-emerald-500">● En ronda</span>
                  <span className="text-muted-foreground">
                    {r.checkpointsCompletados}/{r.checkpointsTotal}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : r.id); }}
                className="p-1 rounded hover:bg-muted"
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-2">
              <RondaProgress completed={r.checkpointsCompletados} total={r.checkpointsTotal} />
            </div>

            {hasAlerts && (
              <div className="mt-2 space-y-1">
                {r.alerts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded bg-red-500/10 border border-red-500/20 px-2 py-1">
                    <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                    <span className="text-[10px] text-red-400 truncate">{a.mensaje}</span>
                  </div>
                ))}
              </div>
            )}

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                {r.guardiaPhone && (
                  <a
                    href={`tel:${r.guardiaPhone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 text-xs text-blue-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="h-3 w-3" /> Llamar
                  </a>
                )}

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Timeline de marcaciones:</p>
                  {r.marcaciones.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground w-10 shrink-0">
                        {new Date(m.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-foreground">{m.checkpointName ?? "Checkpoint"}</span>
                      {m.fotoEvidenciaUrl && <span className="text-muted-foreground">📷</span>}
                    </div>
                  ))}
                  {r.marcaciones.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Sin marcaciones aún</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
