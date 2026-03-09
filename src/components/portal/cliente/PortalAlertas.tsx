"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Loader2, Mail, Smartphone, Inbox, Settings2, MessageSquare, Receipt, Award, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PreviewBadge } from "./PreviewBadge";

/* ─── Notification Types ─── */

interface Notification {
  type: string;
  title: string;
  description: string;
  time: string;
  isRead: boolean;
}

const NOTIF_ICONS: Record<string, typeof Bell> = {
  ronda_completada: ShieldCheck,
  ticket_respondido: MessageSquare,
  cotizacion_nueva: Receipt,
  guardia_destacado: Award,
};

const DEMO_NOTIFICACIONES: Notification[] = [
  { type: "ronda_completada", title: "Ronda nocturna completada", description: "100% checkpoints verificados", time: "Hace 2h", isRead: false },
  { type: "ticket_respondido", title: "Ticket #1234 respondido", description: "Tu consulta sobre dotación fue respondida", time: "Hace 5h", isRead: false },
  { type: "cotizacion_nueva", title: "Nueva cotización disponible", description: "CPQ-2026-022 lista para revisión", time: "Hace 1d", isRead: true },
  { type: "guardia_destacado", title: "Guardia del mes: Roberto Muñoz", description: "Trust Score 9.2 — Mejor rendimiento", time: "Hace 3d", isRead: true },
];

/* ─── Alert Config Types ─── */

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
  isProspect?: boolean;
}

type ActiveTab = "lista" | "config";

export function PortalAlertas({ session, isProspect }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("lista");

  if (isProspect) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-100">Notificaciones</h2>
              <PreviewBadge />
            </div>
            <p className="text-xs text-zinc-500">Historial y configuración de alertas</p>
          </div>
        </div>

        {/* Demo notifications */}
        <div className="space-y-2 mb-6">
          {DEMO_NOTIFICACIONES.map((n, i) => {
            const Icon = NOTIF_ICONS[n.type] ?? Bell;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors",
                  n.isRead
                    ? "border-white/5 bg-white/[0.01] opacity-60"
                    : "border-white/10 bg-white/[0.02]"
                )}
              >
                <div className="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{n.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{n.description}</p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{n.time}</span>
              </div>
            );
          })}
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5 space-y-3">
          <p className="text-sm text-zinc-300 font-medium">Alertas en tiempo real</p>
          <ul className="space-y-2 text-xs text-zinc-400">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Guardia ausente o ronda incompleta</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Incidentes reportados en tiempo real</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Notificaciones por email y push</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Configuración personalizada por tipo</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Notificaciones</h2>
          <p className="text-xs text-zinc-500">Historial y configuración de alertas</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("lista")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
            activeTab === "lista" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"
          )}
        >
          <Inbox className="h-4 w-4" />
          Notificaciones
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
            activeTab === "config" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"
          )}
        >
          <Settings2 className="h-4 w-4" />
          Configuración
        </button>
      </div>

      {activeTab === "lista" && (
        <NotificacionesLista session={session} />
      )}
      {activeTab === "config" && (
        <AlertasConfig session={session} />
      )}
    </div>
  );
}

/* ─── Notificaciones Lista Sub-Component ─── */

function NotificacionesLista({ session }: { session: ClienteSession }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/cliente/notificaciones?accountId=${encodeURIComponent(session.accountId)}&tenantId=${encodeURIComponent(session.tenantId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setNotifications(res.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.accountId, session.tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-16">
        <Inbox className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-400">No hay notificaciones</p>
        <p className="text-xs text-zinc-600 mt-1">Las notificaciones aparecerán aquí cuando haya actividad</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n, i) => {
        const Icon = NOTIF_ICONS[n.type] ?? Bell;
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors",
              n.isRead
                ? "border-white/5 bg-white/[0.01] opacity-60"
                : "border-white/10 bg-white/[0.02]"
            )}
          >
            <div className="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-100">{n.title}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{n.description}</p>
            </div>
            <span className="text-[10px] text-zinc-600 shrink-0">{n.time}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Alertas Config Sub-Component ─── */

function AlertasConfig({ session }: { session: ClienteSession }) {
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
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <>
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
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
        )}
      </div>

      {/* Alert rows */}
      <div className="space-y-2">
        {configs.map((cfg) => {
          const meta = ALERT_LABELS[cfg.alertType];
          if (!meta) return null;
          return (
            <div
              key={cfg.alertType}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                cfg.isActive
                  ? "border-white/10 bg-white/[0.02]"
                  : "border-white/5 bg-white/[0.01] opacity-60"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{meta.label}</p>
                <p className="text-[11px] text-zinc-500 leading-tight">{meta.desc}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <button
                  onClick={() => toggle(cfg.alertType, "email")}
                  disabled={!cfg.isActive}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed",
                    cfg.channels.email && cfg.isActive
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-zinc-800/50 text-zinc-600"
                  )}
                  title="Toggle email"
                >
                  <Mail className="h-4 w-4" />
                </button>

                <button
                  onClick={() => toggle(cfg.alertType, "push")}
                  disabled={!cfg.isActive}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed",
                    cfg.channels.push && cfg.isActive
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-zinc-800/50 text-zinc-600"
                  )}
                  title="Toggle push"
                >
                  <Smartphone className="h-4 w-4" />
                </button>

                <button
                  onClick={() => toggle(cfg.alertType, "isActive")}
                  className={cn(
                    "w-8 h-5 rounded-full relative transition-colors",
                    cfg.isActive ? "bg-teal-500" : "bg-zinc-700"
                  )}
                  title="Toggle activo"
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      cfg.isActive ? "translate-x-3" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
