"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Bell, Loader2, Mail, Smartphone } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";

interface AlertConfig {
  id: string | null;
  alertType: string;
  channels: { push: boolean; email: boolean };
  isActive: boolean;
}

const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  ronda_no_realizada: { label: "Ronda no realizada", desc: "Cuando una ronda programada no fue ejecutada" },
  ronda_incompleta: { label: "Ronda incompleta", desc: "Cuando una ronda no alcanza el 100% de checkpoints" },
  new_document: { label: "Nuevo documento", desc: "Cuando se sube un documento a tu portal" },
  ticket_replied: { label: "Respuesta en ticket", desc: "Cuando el equipo de soporte responde tu ticket" },
  quote_pending: { label: "Cotización pendiente", desc: "Cuando hay una cotización esperando tu revisión" },
  contract_expiring: { label: "Contrato por vencer", desc: "Cuando un contrato está próximo a expirar" },
};

interface Props {
  session: ClienteSession;
  open: boolean;
  onClose: () => void;
}

export function PortalNotificacionesSheet({ session, open, onClose }: Props) {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch("/api/portal/cliente/alertas/config", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => { if (res.success) setConfigs(res.data ?? []); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open]);

  const save = useCallback(async (updated: AlertConfig[]) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/portal/cliente/alertas/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated.map((c) => ({
          alertType: c.alertType,
          channels: c.channels,
          isActive: c.isActive,
        }))),
      }).then((r) => r.json());
      if (res.success && res.data) {
        const serverMap = new Map<string, string>(res.data.map((d: AlertConfig) => [d.alertType, d.id as string]));
        setConfigs((prev) => prev.map((c) => ({ ...c, id: serverMap.get(c.alertType) ?? c.id })));
      }
    } catch {}
    setIsSaving(false);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (alertType: string, field: "isActive" | "push" | "email") => {
    setConfigs((prev) => {
      const next = prev.map((c) => {
        if (c.alertType !== alertType) return c;
        if (field === "isActive") return { ...c, isActive: !c.isActive };
        return { ...c, channels: { ...c.channels, [field]: !c.channels[field] } };
      });
      save(next);
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Preferencias de notificaciones</h2>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 pb-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {/* Column labels */}
              <div className="flex items-center gap-2 px-2 mb-2">
                <div className="flex-1" />
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
                    <Mail className="h-3.5 w-3.5" />Email
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
                    <Smartphone className="h-3.5 w-3.5" />Push
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center">
                    Activo
                  </span>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {configs.map((cfg) => {
                  const meta = ALERT_LABELS[cfg.alertType];
                  if (!meta) return null;
                  return (
                    <div
                      key={cfg.alertType}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${
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
                        <button
                          onClick={() => toggle(cfg.alertType, "email")}
                          disabled={!cfg.isActive}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            cfg.channels.email && cfg.isActive
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-zinc-800/50 text-zinc-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggle(cfg.alertType, "push")}
                          disabled={!cfg.isActive}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            cfg.channels.push && cfg.isActive
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-zinc-800/50 text-zinc-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <Smartphone className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggle(cfg.alertType, "isActive")}
                          className={`w-8 h-5 rounded-full relative transition-colors ${
                            cfg.isActive ? "bg-teal-500" : "bg-zinc-700"
                          }`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            cfg.isActive ? "translate-x-3" : "translate-x-0.5"
                          }`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
