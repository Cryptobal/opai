"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield,
  CalendarDays,
  Clock,
  DollarSign,
  MapPin,
  Loader2,
  Check,
  CheckCircle2,
  Siren,
  Zap,
} from "lucide-react";
import type { GuardSession } from "@/lib/guard-portal";

interface AlertaGuardiaItem {
  id: string;
  instalacion: {
    id: string;
    name: string;
    address: string | null;
    commune: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  };
  fechaInicio: string;
  fechaFin: string;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  estado: string;
  tiempoRestanteSeg: number;
  aceptada: boolean;
  createdAt: string;
}

export function AlertasCoberturaGuardiaSection({ session }: { session: GuardSession }) {
  const [alertas, setAlertas] = useState<AlertaGuardiaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const fetchAlertas = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/guardia/alertas?guardiaId=${session.guardiaId}`);
      const json = await res.json();
      if (json.success) setAlertas(json.data);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 30000);
    return () => clearInterval(interval);
  }, [fetchAlertas]);

  const handleAceptar = async (alertaId: string) => {
    setAcceptingId(alertaId);
    try {
      const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}/aceptar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId: session.guardiaId }),
      });
      const json = await res.json();
      if (json.success) {
        setAcceptedId(alertaId);
        toast.success("¡Turno confirmado!");
        setTimeout(() => fetchAlertas(), 2000);
      } else {
        if (json.error?.includes("ya fue aceptada") || json.error?.includes("ya aceptada")) {
          toast("Este puesto ya fue aceptado. ¡Gracias por tu disposición!", { icon: "⏳" });
        } else {
          toast.error(json.error || "Error al aceptar");
        }
      }
    } catch {
      toast.error("Error al aceptar turno");
    } finally {
      setAcceptingId(null);
    }
  };

  const fmtClp = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Zap className="h-5 w-5 text-status-warn-fg" />
        Turnos Disponibles
      </h2>

      {alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            No hay turnos extra disponibles en este momento
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Te notificaremos cuando haya uno para ti
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alertas.map((alerta) => {
            const isAccepted = acceptedId === alerta.id;
            const isAccepting = acceptingId === alerta.id;
            const isAlreadyAccepted = alerta.aceptada;

            return (
              <div
                key={alerta.id}
                className={`rounded-xl border p-4 space-y-3 ${
                  alerta.urgencia === "URGENTE"
                    ? "border-status-danger-border bg-status-danger-soft"
                    : "border-border bg-card"
                } ${isAccepted ? "border-status-ok bg-status-ok-soft" : ""}`}
              >
                {alerta.urgencia === "URGENTE" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-danger-fg animate-pulse">
                    <Siren className="h-3.5 w-3.5" />
                    URGENTE
                  </span>
                )}

                <h3 className="text-base font-semibold">{alerta.instalacion.name}</h3>
                {alerta.instalacion.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {alerta.instalacion.address}
                    {alerta.instalacion.commune && `, ${alerta.instalacion.commune}`}
                  </p>
                )}

                <div className="h-px bg-border" />

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">
                      {new Date(alerta.fechaInicio).toLocaleDateString("es-CL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">
                      {new Date(alerta.fechaInicio).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" — "}
                      {new Date(alerta.fechaFin).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-status-ok-fg" />
                  <span className="text-xl font-bold text-status-ok-fg font-mono">
                    {fmtClp(alerta.montoOfrecido)}
                  </span>
                </div>

                {alerta.funciones && (
                  <p className="text-xs text-muted-foreground">
                    🛡️ {alerta.funciones}
                  </p>
                )}

                <div className="h-px bg-border" />

                {!isAlreadyAccepted && !isAccepted && alerta.tiempoRestanteSeg > 0 && (
                  <AlertaCountdown initialSeconds={alerta.tiempoRestanteSeg} />
                )}

                {isAccepted ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-status-ok-fg">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">¡Turno confirmado!</span>
                  </div>
                ) : isAlreadyAccepted ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                    <span className="text-xs">Ya fue aceptado por otro guardia</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAceptar(alerta.id)}
                    disabled={isAccepting}
                    className="w-full py-3.5 rounded-lg bg-status-ok hover:brightness-110 active:brightness-95 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    {isAccepting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isAccepting ? "Aceptando..." : "ACEPTAR TURNO"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertaCountdown({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const interval = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  if (seconds <= 0) {
    return (
      <p className="text-xs text-muted-foreground animate-pulse text-center">
        Escalando a siguiente oleada...
      </p>
    );
  }

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const display = `${min}:${String(sec).padStart(2, "0")}`;
  const color =
    seconds > 300
      ? "text-status-ok-fg"
      : seconds > 60
        ? "text-status-warn-fg"
        : "text-status-danger-fg animate-pulse";

  return (
    <div className="flex items-center justify-center gap-2">
      <span className={`font-mono text-lg font-bold tabular-nums ${color}`}>
        ⏱ {display}
      </span>
    </div>
  );
}
