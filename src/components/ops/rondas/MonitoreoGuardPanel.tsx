"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Phone, AlertTriangle, MessageSquarePlus, MessageCircle, Send } from "lucide-react";
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
  trustScore: number | null;
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
  onMessage?: (installationId: string) => void;
}

export function MonitoreoGuardPanel({ rondas, onSelectGuard, selectedId, onAddNote, onMessage }: Props) {
  // Start with all cards expanded by default (en_curso rondas should be visible)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
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
    <div className="space-y-2">
      {rondas.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground mx-3">
          No hay rondas activas en este momento.
        </div>
      )}

      {rondas.map((r) => {
        const isExpanded = !collapsedIds.has(r.id);
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
              hasAlerts && "border-status-danger-border",
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
                  <span className="inline-block mt-0.5 rounded-full bg-status-warn-soft border border-status-warn-border px-1.5 py-0.5 text-[9px] font-semibold text-status-warn-fg">
                    Ronda Libre
                  </span>
                )}
                <div className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className={r.status === "en_curso" ? "text-status-ok-fg" : r.status === "completada" ? "text-status-info-fg" : "text-muted-foreground"}>
                    ● {r.status === "en_curso" ? "En ronda" : r.status === "completada" ? "Completada" : r.status === "incompleta" ? "Incompleta" : r.status}
                  </span>
                  <span className="text-muted-foreground">
                    {r.checkpointsCompletados}/{r.checkpointsTotal} ({pct}%)
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {hasIncidents && (
                    <span className="rounded-full bg-status-danger-soft border border-status-danger-border px-1.5 py-0.5 text-[10px] text-status-danger-fg font-medium">
                      {r.incidentes!.length} incidente{r.incidentes!.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setCollapsedIds((prev) => { const next = new Set(prev); if (isExpanded) next.add(r.id); else next.delete(r.id); return next; }); }}
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
                  <div key={a.id} className="flex items-center gap-2 rounded bg-status-danger-soft border border-status-danger-border px-2 py-1">
                    <AlertTriangle className="h-3 w-3 text-status-danger-fg shrink-0" />
                    <span className="text-[10px] text-status-danger-fg truncate">{a.mensaje}</span>
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-status-info-soft border border-status-info-border px-2.5 py-1.5 text-xs text-status-info-fg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" /> Llamar
                    </a>
                  )}
                  {onMessage && r.installationId && (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-status-info-soft border border-status-info-border px-2.5 py-1.5 text-xs text-status-info-fg"
                      onClick={(e) => { e.stopPropagation(); onMessage(r.installationId!); }}
                    >
                      <MessageCircle className="h-3 w-3" /> Mensaje
                    </button>
                  )}
                  {onAddNote && r.guardiaId && r.installationId && (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-status-warn-soft border border-status-warn-border px-2.5 py-1.5 text-xs text-status-warn-fg"
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
                      <span className="text-foreground">{m.checkpointName ?? "Punto GPS"}</span>
                      {m.fotoEvidenciaUrl && (
                        <a href={m.fotoEvidenciaUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                          <img src={m.fotoEvidenciaUrl} alt="Foto" className="h-5 w-5 rounded object-cover border border-status-info-border" />
                        </a>
                      )}
                    </div>
                  ))}
                  {r.marcaciones.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Sin marcaciones aún</p>
                  )}
                </div>

                {hasIncidents && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-status-danger-fg font-medium">Incidentes reportados:</p>
                    {r.incidentes!.map((inc) => (
                      <div key={inc.id} className="rounded-lg bg-status-danger-soft border border-status-danger-border p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-status-danger-fg">
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
