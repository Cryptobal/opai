"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Circle,
  MessageSquare,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  new_lead: "🔔",
  lead_approved: "✅",
  quote_sent: "📧",
  quote_viewed: "👁️",
  contract_required: "📝",
  contract_expiring: "⚠️",
  contract_expired: "🔴",
  guardia_doc_expiring: "🟠",
  guardia_doc_expired: "🔴",
  new_postulacion: "📋",
  document_signed_completed: "✅",
  email_opened: "👀",
  email_clicked: "🖱️",
  email_bounced: "⚠️",
  followup_sent: "📨",
  followup_scheduled: "⏰",
  followup_failed: "❌",
  mention: "💬",
  ticket_created: "🎫",
  ticket_approved: "✅",
  ticket_rejected: "❌",
  ticket_sla_breached: "🚨",
  ticket_sla_approaching: "⏳",
  refuerzo_solicitud_created: "📋",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Lista completa de notificaciones del usuario.
 * Todos los usuarios del hub pueden ver sus notificaciones, con links y marcar como leídas.
 */
export function NotificationListClient() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data || []);
        setUnreadCount(json.meta?.unreadCount ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setActionLoading(false);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const deleteAll = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const removed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (removed && !removed.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // silent
    }
  };

  const handleClick = (n: NotificationItem) => {
    if (!n.read) markOneRead(n.id);
    if (n.link) {
      router.push(n.link);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <h3 className="text-lg font-semibold">Tus notificaciones</h3>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : "Todas leídas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={actionLoading}
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Marcar todas leídas
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={deleteAll}
              disabled={actionLoading}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Eliminar todas
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No hay notificaciones</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`group flex items-start gap-3 py-3 hover:bg-accent/50 transition-colors -mx-2 px-2 rounded ${
                  !n.read ? "bg-primary/5" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!n.read) markOneRead(n.id);
                  }}
                  className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  title={n.read ? "Leída" : "Marcar como leída"}
                >
                  {n.read ? (
                    <CheckCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <span className="text-lg shrink-0 mt-0.5">
                  {TYPE_ICONS[n.type] || "📌"}
                </span>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handleClick(n)}
                  >
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm truncate ${
                          !n.read ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    {n.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {timeAgo(n.createdAt)}
                    </p>
                  </button>
                  {(n.type === "followup_sent" || n.type === "email_opened") &&
                    (n.data as { whatsappUrl?: string })?.whatsappUrl && (
                      <a
                        href={(n.data as { whatsappUrl: string }).whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Enviar WhatsApp
                      </a>
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-1 mt-0.5">
                  {n.link && (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOne(n.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
