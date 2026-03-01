"use client";

import { AlertTriangle, CheckCircle2, Eye, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

const SEVERITY_STYLES: Record<string, { badge: string; border: string; icon: string }> = {
  critical: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    border: "border-red-500/20",
    icon: "text-red-400",
  },
  warning: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    border: "border-amber-500/20",
    icon: "text-amber-400",
  },
  info: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    border: "border-blue-500/20",
    icon: "text-blue-400",
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
  const sev = SEVERITY_STYLES[alerta.severidad] ?? SEVERITY_STYLES.info;
  const guardiaNombre = alerta.ejecucion?.guardia?.persona
    ? `${alerta.ejecucion.guardia.persona.firstName} ${alerta.ejecucion.guardia.persona.lastName}`
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2 transition-opacity",
        sev.border,
        alerta.resuelta && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", sev.icon)} />
          <Badge variant="outline" className={cn("text-[10px] shrink-0", sev.badge)}>
            {alerta.severidad.toUpperCase()}
          </Badge>
          <span className="text-xs font-medium truncate">
            {TIPO_LABELS[alerta.tipo] ?? alerta.tipo}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(alerta.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{alerta.mensaje}</p>

      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
        {guardiaNombre && (
          <span className="flex items-center gap-0.5">
            <Shield className="h-3 w-3" /> {guardiaNombre}
          </span>
        )}
        {alerta.installation?.name && (
          <span>· {alerta.installation.name}</span>
        )}
        {alerta.ejecucion?.rondaTemplate?.name && (
          <span>· {alerta.ejecucion.rondaTemplate.name}</span>
        )}
      </div>

      {alerta.isAcknowledged && !alerta.resuelta && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-500/70">
          <Eye className="h-3 w-3" />
          Reconocida{alerta.acknowledgedBy ? ` por ${alerta.acknowledgedBy}` : ""}
          {alerta.acknowledgedAt && ` · ${new Date(alerta.acknowledgedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
      )}

      {alerta.resuelta && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CheckCircle2 className="h-3 w-3" />
          Resuelta{alerta.resueltaAt && ` · ${new Date(alerta.resueltaAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
      )}

      {!alerta.resuelta && (
        <div className="flex gap-1.5 pt-1">
          {!alerta.isAcknowledged && onAcknowledge && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAcknowledge(alerta.id)}>
              <Eye className="h-3 w-3" /> Reconocer
            </Button>
          )}
          {onResolve && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onResolve(alerta.id)}>
              <CheckCircle2 className="h-3 w-3" /> Resolver
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
