"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  Mail,
  MailOpen,
  Clock,
  Send,
  Loader2,
  RefreshCw,
} from "lucide-react";

type OnboardingData = {
  estado: string;
  emailEnviado: boolean;
  fechaEnvio: string | null;
  emailAbierto: boolean;
  fechaAbierto: string | null;
  accesoPortalGuardia: boolean;
  fechaAccesoGuardia: string | null;
  accesoPortalRondas: boolean;
  fechaAccesoRondas: string | null;
  accesoPortalAcceso: boolean;
  fechaAccesoAcceso: string | null;
  recordatorioEnviado: boolean;
  fechaRecordatorio: string | null;
  completadoAt: string | null;
};

type EmailLogItem = {
  id: string;
  tipo: string;
  trigger: string | null;
  asunto: string;
  estado: string;
  abierto: boolean;
  createdAt: string;
};

interface OnboardingSectionProps {
  guardiaId: string;
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: "bg-muted text-muted-foreground",
  ENVIADO: "bg-status-warn-soft text-status-warn-fg",
  EN_PROGRESO: "bg-status-info-soft text-status-info-fg",
  COMPLETADO: "bg-green-500/20 text-status-ok-fg",
};

const STEPPER_STEPS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "enviado", label: "Email enviado" },
  { key: "en_progreso", label: "En progreso" },
  { key: "completado", label: "Completado" },
];

function stepIndex(estado: string): number {
  const map: Record<string, number> = {
    PENDIENTE: 0,
    ENVIADO: 1,
    EN_PROGRESO: 2,
    COMPLETADO: 3,
  };
  return map[estado] ?? 0;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PortalAccessRow({
  label,
  accessed,
  date,
}: {
  label: string;
  accessed: boolean;
  date: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        {accessed ? (
          <>
            <Check className="h-4 w-4 text-status-ok-fg" />
            <span className="text-xs text-muted-foreground">
              {formatDate(date)}
            </span>
          </>
        ) : (
          <X className="h-4 w-4 text-status-danger-fg" />
        )}
      </div>
    </div>
  );
}

export default function OnboardingSection({
  guardiaId,
}: OnboardingSectionProps) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch(
        `/api/personas/onboarding/guardia?guardiaId=${guardiaId}`
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data.status);
        setLogs(json.data.logs ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [guardiaId]);

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/personas/onboarding/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Onboarding reenviado");
        await fetchData();
      } else {
        toast.error(json.error || "Error al reenviar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setResending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No hay información de onboarding para este guardia.
        </p>
        <Button size="sm" onClick={handleResend} disabled={resending}>
          {resending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Send className="h-3.5 w-3.5 mr-1.5" />
          )}
          Enviar onboarding
        </Button>
      </div>
    );
  }

  const current = stepIndex(data.estado);

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-center gap-1">
        {STEPPER_STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shrink-0 ${
                i < current
                  ? "bg-green-500/20 text-status-ok-fg"
                  : i === current
                    ? "bg-primary/20 text-primary ring-1 ring-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-[11px] ${i <= current ? "text-foreground" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
            {i < STEPPER_STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 ${i < current ? "bg-green-500/40" : "bg-border"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Estado actual badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_COLORS[data.estado] ?? "bg-muted text-muted-foreground"}`}
        >
          {data.estado.replace("_", " ")}
        </span>
        {data.completadoAt && (
          <span className="text-xs text-muted-foreground">
            Completado: {formatDate(data.completadoAt)}
          </span>
        )}
      </div>

      {/* Email info */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Mail className="h-4 w-4 text-muted-foreground" /> Email de onboarding
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-1">
              Enviado
            </p>
            <p className="text-[13px]">
              {data.emailEnviado ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-status-ok-fg" />
                  {formatDate(data.fechaEnvio)}
                </span>
              ) : (
                <span className="text-muted-foreground/70">No enviado</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-1">
              Abierto
            </p>
            <p className="text-[13px]">
              {data.emailAbierto ? (
                <span className="flex items-center gap-1.5">
                  <MailOpen className="h-3.5 w-3.5 text-status-ok-fg" />
                  {formatDate(data.fechaAbierto)}
                </span>
              ) : (
                <span className="text-muted-foreground/70">No abierto</span>
              )}
            </p>
          </div>
        </div>
        {data.recordatorioEnviado && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/40">
            <Clock className="h-3.5 w-3.5" />
            Recordatorio enviado: {formatDate(data.fechaRecordatorio)}
          </div>
        )}
      </div>

      {/* Portal access */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
        <h4 className="text-sm font-semibold text-foreground mb-2">Acceso a portales</h4>
        <PortalAccessRow
          label="Portal del Guardia"
          accessed={data.accesoPortalGuardia}
          date={data.fechaAccesoGuardia}
        />
        <PortalAccessRow
          label="Portal de Rondas"
          accessed={data.accesoPortalRondas}
          date={data.fechaAccesoRondas}
        />
        <PortalAccessRow
          label="Portal de Acceso"
          accessed={data.accesoPortalAcceso}
          date={data.fechaAccesoAcceso}
        />
      </div>

      {/* Timeline de emails */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Historial de emails</h4>
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm py-2 border-b border-border/40 last:border-0"
                >
                  <div className="mt-0.5">
                    {log.abierto ? (
                      <MailOpen className="h-4 w-4 text-status-ok-fg" />
                    ) : (
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{log.asunto}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.trigger ?? log.tipo} — {formatDate(log.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      log.estado === "ABIERTO"
                        ? "bg-green-500/20 text-status-ok-fg"
                        : log.estado === "REBOTADO"
                          ? "bg-status-danger-soft text-status-danger-fg"
                          : log.estado === "ENTREGADO"
                            ? "bg-status-info-soft text-status-info-fg"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {log.estado}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Re-enviar onboarding
        </Button>
      </div>
    </div>
  );
}
