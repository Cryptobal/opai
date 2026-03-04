"use client";

import { CheckCircle2, Eye, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/personas";

interface Alerta {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  isAcknowledged?: boolean;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resueltaPor?: string | null;
  resueltaAt?: string | null;
  createdAt: string;
  data?: Record<string, unknown> | null;
  installation?: { id: string; name: string } | null;
  ejecucion?: {
    id: string;
    status: string;
    rondaTemplate?: { name: string } | null;
    guardia?: { persona?: { firstName: string; lastName: string } } | null;
  } | null;
}

interface Props {
  alerta: Alerta;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}

const SEVERITY_CONFIG: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  critical: {
    dot: "bg-red-400 animate-pulse",
    border: "border-red-500/20 border-l-red-500",
    bg: "bg-red-500/5",
    label: "Crítica",
  },
  warning: {
    dot: "bg-amber-400",
    border: "border-amber-500/20 border-l-amber-500",
    bg: "bg-amber-500/5",
    label: "Warning",
  },
  info: {
    dot: "bg-blue-400",
    border: "border-blue-500/20 border-l-blue-500",
    bg: "bg-blue-500/5",
    label: "Info",
  },
};

const TIPO_LABELS: Record<string, string> = {
  guardia_estatico: "Guardia estático",
  checkpoint_saltado: "Checkpoint saltado",
  velocidad_anomala: "Velocidad anómala",
  ronda_no_iniciada: "Ronda no iniciada",
  breach_geocerca: "Breach de geocerca",
  panico: "Botón de pánico",
  geo_fuera_rango: "Fuera de rango GPS",
  sin_movimiento: "Sin movimiento",
  mismo_punto_repetido: "Punto repetido",
  bateria_baja: "Batería baja",
};

export function AlertaCard({ alerta, onAcknowledge, onResolve }: Props) {
  const sev = SEVERITY_CONFIG[alerta.severidad] ?? SEVERITY_CONFIG.info;
  const guardiaNombre = alerta.ejecucion?.guardia?.persona
    ? formatPersonName(alerta.ejecucion.guardia.persona.firstName, alerta.ejecucion.guardia.persona.lastName)
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-l-2 p-3.5 space-y-2.5 transition-all",
        sev.border,
        sev.bg,
        alerta.resuelta && "opacity-50",
      )}
    >
      {/* Header: severity dot + tipo + timestamp */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", sev.dot)} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#f1f5f9] truncate">
              {TIPO_LABELS[alerta.tipo] ?? alerta.tipo}
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{
              color: alerta.severidad === "critical" ? "#ef4444" : alerta.severidad === "warning" ? "#f59e0b" : "#3b82f6"
            }}>
              {sev.label}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-[#64748b] shrink-0 tabular-nums">
          {new Date(alerta.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Message */}
      <p className="text-[12px] text-[#94a3b8] leading-snug">{alerta.mensaje}</p>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {guardiaNombre && (
          <span className="flex items-center gap-1 text-[11px] text-[#94a3b8]">
            <Shield className="h-3 w-3" /> {guardiaNombre}
          </span>
        )}
        {alerta.installation?.name && (
          <span className="text-[11px] text-[#64748b]">{alerta.installation.name}</span>
        )}
        {alerta.ejecucion?.rondaTemplate?.name && (
          <span className="text-[11px] text-[#64748b]">{alerta.ejecucion.rondaTemplate.name}</span>
        )}
      </div>

      {/* Status line */}
      {alerta.isAcknowledged && !alerta.resuelta && (
        <div className="flex items-center gap-1.5 text-[11px] text-green-400">
          <Eye className="h-3 w-3" />
          Reconocida{alerta.acknowledgedBy ? ` por ${alerta.acknowledgedBy}` : ""}
        </div>
      )}
      {alerta.resuelta && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
          <CheckCircle2 className="h-3 w-3" />
          Resuelta{alerta.resueltaAt
            ? ` · ${new Date(alerta.resueltaAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </div>
      )}

      {/* Actions */}
      {!alerta.resuelta && (
        <div className="flex gap-1.5 pt-0.5">
          {!alerta.isAcknowledged && onAcknowledge && (
            <button
              onClick={() => onAcknowledge(alerta.id)}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#2dd4bf]/40 transition-colors flex items-center gap-1"
            >
              <Eye className="h-3 w-3" /> Reconocer
            </button>
          )}
          {onResolve && (
            <button
              onClick={() => onResolve(alerta.id)}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-green-500/20 text-green-400 hover:bg-green-500/10 transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="h-3 w-3" /> Resolver
            </button>
          )}
        </div>
      )}
    </div>
  );
}
