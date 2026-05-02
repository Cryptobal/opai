"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Moon, Sun, Clock, User, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types matching the history endpoint response ─── */
interface HistorialGuardia {
  id: string;
  guardiaNombre: string;
  status: string;
  turno: string;
  isExtra: boolean;
  horaLlegada: string | null;
  notes: string | null;
}

interface HistorialInstalacion {
  id: string;
  installationName: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  coberturaStatus: string;
  statusInstalacion: string;
  notes: string | null;
  guardias: HistorialGuardia[];
}

interface HistorialControlNocturno {
  id: string;
  date: string;
  centralOperatorName: string;
  centralLabel: string | null;
  shiftStart: string;
  shiftEnd: string;
  instalaciones: HistorialInstalacion[];
}

export interface HistorialTurno {
  id: string;
  startedAt: string;
  endedAt: string | null;
  operatorName: string | null;
  totalRoundsMonitored: number;
  totalAlertsHandled: number;
  aiSummary: string | null;
  operatorComments: string | null;
  emailSentTo: Record<string, unknown> | null;
  controlNocturno: HistorialControlNocturno | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  turno: HistorialTurno;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  presente: { label: "Presente", color: "text-status-ok-fg" },
  en_camino: { label: "En camino", color: "text-status-info-fg" },
  pendiente: { label: "Pendiente", color: "text-zinc-400" },
  no_viene: { label: "No viene", color: "text-status-danger-fg" },
  reemplazo: { label: "Reemplazo", color: "text-status-warn-fg" },
};

const COBERTURA_COLORS: Record<string, string> = {
  completa: "border-status-ok-border bg-status-ok-soft",
  parcial: "border-status-warn-border bg-status-warn-soft",
  descubierta: "border-status-danger-border bg-status-danger-soft",
  pendiente: "border-zinc-500/30 bg-zinc-500/10",
};

export function HistorialGridDialog({ open, onClose, turno }: Props) {
  const cn_ = turno.controlNocturno;
  if (!cn_) return null;

  const dateStr = new Date(cn_.date).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const coberturas = turno.emailSentTo as Record<string, string> | null;
  const nocturnaAt = coberturas?.coberturaNocturnaSentAt;
  const diurnaAt = coberturas?.coberturaDiurnaSentAt;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Planilla de monitoreo</DialogTitle>
        </DialogHeader>

        {/* Meta header */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="capitalize">{dateStr}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {cn_.shiftStart} → {cn_.shiftEnd}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {cn_.centralOperatorName}
            </span>
            {cn_.centralLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {cn_.centralLabel}
              </span>
            )}
          </div>

          {/* Cobertura badges */}
          <div className="flex gap-2 text-[10px]">
            {nocturnaAt ? (
              <span className="inline-flex items-center gap-1 text-status-ok-fg">
                <Moon className="h-3 w-3" /> Nocturna enviada{" "}
                {new Date(nocturnaAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <Moon className="h-3 w-3" /> Nocturna no enviada
              </span>
            )}
            {diurnaAt ? (
              <span className="inline-flex items-center gap-1 text-status-ok-fg">
                <Sun className="h-3 w-3" /> Diurna enviada{" "}
                {new Date(diurnaAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <Sun className="h-3 w-3" /> Diurna no enviada
              </span>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="space-y-2 mt-2">
          {cn_.instalaciones.map((inst) => {
            const isDescubierta = inst.coberturaStatus === "descubierta";
            const nocturnos = inst.guardias.filter((g) => g.turno === "nocturno");
            const diurnos = inst.guardias.filter((g) => g.turno === "diurno");

            return (
              <div
                key={inst.id}
                className={cn(
                  "rounded-lg border p-3",
                  COBERTURA_COLORS[inst.coberturaStatus] ?? COBERTURA_COLORS.pendiente,
                  isDescubierta && "border-l-4 border-l-red-500",
                )}
              >
                {/* Installation header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{inst.installationName}</span>
                    {isDescubierta && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-status-danger-fg">
                        <AlertTriangle className="h-3 w-3" /> DESCUBIERTA
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {inst.guardiasPresentes}/{inst.guardiasRequeridos} presentes
                  </span>
                </div>

                {inst.notes && (
                  <p className="text-[10px] text-muted-foreground mb-2 italic">{inst.notes}</p>
                )}

                {/* Guard groups */}
                {nocturnos.length > 0 && (
                  <GuardGroup label="Nocturno" icon={<Moon className="h-3 w-3" />} guardias={nocturnos} />
                )}
                {diurnos.length > 0 && (
                  <GuardGroup label="Diurno" icon={<Sun className="h-3 w-3" />} guardias={diurnos} />
                )}
                {inst.guardias.length === 0 && (
                  <p className="text-[10px] text-zinc-500 italic">Sin guardias registrados</p>
                )}
              </div>
            );
          })}
        </div>

        {/* AI Summary */}
        {turno.aiSummary && (
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Resumen del turno</p>
            <div className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap max-h-[160px] overflow-y-auto">
              {turno.aiSummary}
            </div>
          </div>
        )}

        {turno.operatorComments && (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Comentarios del operador</p>
            <div className="rounded-lg bg-muted/50 border border-border p-2 text-xs">
              {turno.operatorComments}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Guard group subcomponent ─── */
function GuardGroup({
  label,
  icon,
  guardias,
}: {
  label: string;
  icon: React.ReactNode;
  guardias: HistorialGuardia[];
}) {
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1 mb-1 text-[10px] text-muted-foreground font-medium">
        {icon} {label}
      </div>
      <div className="space-y-0.5 pl-4">
        {guardias.map((g) => {
          const st = STATUS_LABELS[g.status] ?? { label: g.status, color: "text-zinc-400" };
          const isNoViene = g.status === "no_viene";
          return (
            <div
              key={g.id}
              className={cn(
                "flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded",
                isNoViene && "bg-status-danger-soft",
              )}
            >
              <span className={cn("font-medium", isNoViene ? "text-status-danger-fg" : "text-foreground")}>
                {g.guardiaNombre}
              </span>
              <span className={cn("text-[10px]", st.color)}>{st.label}</span>
              {g.isExtra && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-status-info-soft text-status-info-fg font-semibold">
                  EXTRA
                </span>
              )}
              {g.horaLlegada && (
                <span className="text-[10px] text-muted-foreground">{g.horaLlegada}</span>
              )}
              {g.notes && (
                <span className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">
                  {g.notes}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
