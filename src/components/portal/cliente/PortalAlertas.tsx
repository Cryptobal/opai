"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Loader2, Mail, Smartphone } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";

interface AlertConfig {
  id: string | null;
  alertType: string;
  channels: { push: boolean; email: boolean };
  isActive: boolean;
}

const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  guard_absent: {
    label: "Guardia ausente",
    desc: "Cuando un guardia no se presenta a su turno",
  },
  ronda_incomplete: {
    label: "Ronda incompleta",
    desc: "Cuando una ronda no alcanza el 100%",
  },
  checkpoint_missed: {
    label: "Checkpoint sin marcar",
    desc: "Cuando un checkpoint no fue marcado",
  },
  incident: {
    label: "Incidente reportado",
    desc: "Cuando un guardia reporta un incidente",
  },
  new_document: {
    label: "Nuevo documento",
    desc: "Cuando se sube un documento a tu portal",
  },
  ticket_replied: {
    label: "Respuesta en ticket",
    desc: "Cuando el equipo Gard responde tu ticket",
  },
  quote_pending: {
    label: "Cotización pendiente",
    desc: "Cuando hay una cotización esperando tu revisión",
  },
  contract_expiring: {
    label: "Contrato por vencer",
    desc: "Cuando un contrato está próximo a expirar",
  },
};

interface Props {
  session: ClienteSession;
}

export function PortalAlertas({ session }: Props) {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const headers: Record<string, string> = {
    "x-contact-id": session.contactId,
    "x-tenant-id": session.tenantId,
    "x-account-id": session.accountId,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/portal/cliente/alertas/config", { headers })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setConfigs(res.data ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (updated: AlertConfig[]) => {
      setIsSaving(true);
      try {
        const res = await fetch("/api/portal/cliente/alertas/config", {
          method: "PUT",
          headers,
          body: JSON.stringify(
            updated.map((c) => ({
              alertType: c.alertType,
              channels: c.channels,
              isActive: c.isActive,
            }))
          ),
        }).then((r) => r.json());

        if (res.success && res.data) {
          // Merge server-returned ids back in
          const serverMap = new Map<string, string>(
            res.data.map((d: AlertConfig) => [d.alertType, d.id as string])
          );
          setConfigs((prev) =>
            prev.map((c) => ({
              ...c,
              id: serverMap.get(c.alertType) ?? c.id,
            }))
          );
        }
      } catch {}
      setIsSaving(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session]
  );

  const toggle = (alertType: string, field: "isActive" | "push" | "email") => {
    setConfigs((prev) => {
      const next = prev.map((c) => {
        if (c.alertType !== alertType) return c;
        if (field === "isActive") return { ...c, isActive: !c.isActive };
        return {
          ...c,
          channels: { ...c.channels, [field]: !c.channels[field] },
        };
      });
      save(next);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Configuración de alertas</h2>
          <p className="text-xs text-zinc-500">Elige qué notificaciones recibir y por qué canal</p>
        </div>
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500 ml-auto" />
        )}
      </div>

      {/* Column labels */}
      <div className="flex items-center gap-2 px-4 mb-2">
        <div className="flex-1" />
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
            <Mail className="h-3.5 w-3.5" />
            Email
          </span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
            <Smartphone className="h-3.5 w-3.5" />
            Push
          </span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center">
            Activo
          </span>
        </div>
      </div>

      {/* Alert rows */}
      <div className="space-y-2">
        {configs.map((cfg) => {
          const meta = ALERT_LABELS[cfg.alertType];
          if (!meta) return null;
          return (
            <div
              key={cfg.alertType}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                cfg.isActive
                  ? "border-white/10 bg-white/[0.02]"
                  : "border-white/5 bg-white/[0.01] opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{meta.label}</p>
                <p className="text-[11px] text-zinc-500 leading-tight">{meta.desc}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Email toggle */}
                <button
                  onClick={() => toggle(cfg.alertType, "email")}
                  disabled={!cfg.isActive}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    cfg.channels.email && cfg.isActive
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-zinc-800/50 text-zinc-600"
                  } disabled:cursor-not-allowed`}
                  title="Toggle email"
                >
                  <Mail className="h-4 w-4" />
                </button>

                {/* Push toggle */}
                <button
                  onClick={() => toggle(cfg.alertType, "push")}
                  disabled={!cfg.isActive}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    cfg.channels.push && cfg.isActive
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-zinc-800/50 text-zinc-600"
                  } disabled:cursor-not-allowed`}
                  title="Toggle push"
                >
                  <Smartphone className="h-4 w-4" />
                </button>

                {/* Active toggle */}
                <button
                  onClick={() => toggle(cfg.alertType, "isActive")}
                  className={`w-8 h-5 rounded-full relative transition-colors ${
                    cfg.isActive ? "bg-teal-500" : "bg-zinc-700"
                  }`}
                  title="Toggle activo"
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      cfg.isActive ? "translate-x-3" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
