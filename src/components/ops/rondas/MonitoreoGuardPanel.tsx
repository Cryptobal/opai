"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Phone, AlertTriangle, MessageSquarePlus, Send } from "lucide-react";
import { RondaProgress } from "@/components/ops/rondas/ronda-progress";
import { TrustScoreBadge } from "@/components/ops/rondas/trust-score-badge";
import { cn } from "@/lib/utils";

interface Incidente {
  id: string;
  tipo: string;
  descripcion: string;
  fotoUrl?: string | null;
  createdAt: string;
}

interface GuardRonda {
  id: string;
  ejecucionId: string;
  guardiaId?: string | null;
  installationId?: string | null;
  templateName: string;
  isAdHoc?: boolean;
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
  incidentes?: Incidente[];
}

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  incendio: "🔥 Incendio",
  fuga_agua: "💧 Fuga de agua",
  acceso_forzado: "🚪 Acceso forzado",
  persona_sospechosa: "👤 Persona sospechosa",
  falla_electrica: "💡 Falla eléctrica",
  otro: "⚠️ Otro",
};

interface Props {
  rondas: GuardRonda[];
  onSelectGuard: (rondaId: string) => void;
  selectedId: string | null;
  onAddNote?: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
}

export function MonitoreoGuardPanel({ rondas, onSelectGuard, selectedId, onAddNote }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteRondaId, setNoteRondaId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const handleSaveNote = async (r: GuardRonda) => {
    if (!noteText.trim() || !onAddNote || !r.guardiaId || !r.installationId) return;
    setSavingNote(true);
    try {
      await onAddNote(r.ejecucionId, r.guardiaId, r.installationId, noteText.trim());
      setNoteText("");
      setNoteRondaId(null);
    } finally {
      setSavingNote(false);
    }
  };

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
        const hasIncidents = (r.incidentes?.length ?? 0) > 0;
        const isNoting = noteRondaId === r.id;
        const pct = r.checkpointsTotal > 0 ? Math.round((r.checkpointsCompletados / r.checkpointsTotal) * 100) : 0;

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
                {r.isAdHoc && (
                  <span className="inline-block mt-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">
                    Ronda Libre
                  </span>
                )}
                <div className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className="text-emerald-500">● En ronda</span>
                  <span className="text-muted-foreground">
                    {r.checkpointsCompletados}/{r.checkpointsTotal} ({pct}%)
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {hasIncidents && (
                    <span className="rounded-full bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 text-[10px] text-red-400 font-medium">
                      {r.incidentes!.length} incidente{r.incidentes!.length > 1 ? "s" : ""}
                    </span>
                  )}
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
                <div className="flex items-center gap-2">
                  {r.guardiaPhone && (
                    <a
                      href={`tel:${r.guardiaPhone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 text-xs text-blue-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" /> Llamar
                    </a>
                  )}
                  {onAddNote && r.guardiaId && r.installationId && (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-xs text-amber-400"
                      onClick={(e) => { e.stopPropagation(); setNoteRondaId(isNoting ? null : r.id); }}
                    >
                      <MessageSquarePlus className="h-3 w-3" /> Nota
                    </button>
                  )}
                </div>

                {isNoting && (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      className="flex-1 h-8 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground"
                      placeholder="Observación del operador..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(r); }}
                      autoFocus
                    />
                    <button
                      className="h-8 w-8 flex items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50"
                      disabled={!noteText.trim() || savingNote}
                      onClick={() => handleSaveNote(r)}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
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

                {hasIncidents && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-red-400 font-medium">Incidentes reportados:</p>
                    {r.incidentes!.map((inc) => (
                      <div key={inc.id} className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-red-400">
                            {INCIDENT_TYPE_LABELS[inc.tipo] ?? inc.tipo}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(inc.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-[10px] text-foreground">{inc.descripcion}</p>
                        {inc.fotoUrl && (
                          <img src={inc.fotoUrl} alt="Foto incidente" className="h-20 w-full rounded object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
