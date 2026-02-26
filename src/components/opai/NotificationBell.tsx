'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, ExternalLink, Circle, MessageSquare, Trash2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: any;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  new_lead: '🔔',
  lead_approved: '✅',
  quote_sent: '📧',
  quote_viewed: '👁️',
  contract_required: '📝',
  contract_expiring: '⚠️',
  contract_expired: '🔴',
  guardia_doc_expiring: '🟠',
  guardia_doc_expired: '🔴',
  new_postulacion: '📋',
  document_signed_completed: '✅',
  email_opened: '👀',
  email_clicked: '🖱️',
  email_bounced: '⚠️',
  followup_sent: '📨',
  followup_scheduled: '⏰',
  followup_failed: '❌',
  mention: '💬',
  mention_direct: '📌',
  mention_group: '👥',
  note_thread_reply: '🧵',
  ticket_created: '🎫',
  ticket_approved: '✅',
  ticket_rejected: '❌',
  ticket_sla_breached: '🚨',
  ticket_sla_approaching: '⏳',
  refuerzo_solicitud_created: '📋',
};

const NOTE_TYPE_LABEL: Record<string, string> = {
  mention: 'Mención',
  mention_direct: 'Mención directa',
  mention_group: 'Mención grupal',
  note_thread_reply: 'Respuesta en hilo',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

/**
 * NotificationBell - Campana de notificaciones generales
 * Muestra notificaciones del sistema (leads, cotizaciones, etc.)
 * Se actualiza automáticamente cada 30 segundos.
 */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/notifications?limit=20', {
        cache: 'no-store',
        signal,
      });
      const text = await res.text();
      if (!res.ok) return;
      let data: { success?: boolean; data?: Notification[]; meta?: { unreadCount?: number } };
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }
      if (data.success) {
        setNotifications(data.data || []);
        setUnreadCount(data.meta?.unreadCount || 0);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Error fetching notifications:', error);
    }
  }, []);

  // Initial fetch + polling every 30s; abort on unmount
  useEffect(() => {
    const ac = new AbortController();
    fetchNotifications(ac.signal);
    const interval = setInterval(() => fetchNotifications(ac.signal), 30000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  // Refetch when dropdown opens (no signal; one-off fetch)
  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    } finally {
      setLoading(false);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const deleteAll = async () => {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error deleting notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const removed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (removed && !removed.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleClick = (notification: Notification) => {
    if (!notification.read) markOneRead(notification.id);
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  };

  // Evitar hydration mismatch: Radix genera IDs distintos en servidor vs cliente
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'relative p-0',
          compact ? 'h-8 w-8' : 'h-9 w-9'
        )}
        aria-label="Notificaciones"
      >
        <Bell className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'relative p-0',
            compact ? 'h-8 w-8' : 'h-9 w-9'
          )}
        >
          <Bell className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full p-0 text-[10px] flex items-center justify-center animate-pulse"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] max-h-[70vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <h3 className="text-sm font-semibold">Notificaciones</h3>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} sin leer
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => { setOpen(false); router.push('/opai/notificaciones'); }}
              title="Ver todas las notificaciones"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ver todas</span>
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={markAllRead}
                disabled={loading}
                title="Marcar todas como leídas"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Leídas</span>
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={deleteAll}
                disabled={loading}
                title="Eliminar todas"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Eliminar todas</span>
              </Button>
            )}
          </div>
        </div>

        {/* Notifications list */}
        {notifications.length === 0 ? (
          <div className="p-8 text-center bg-muted/20">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay notificaciones
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`group/notif flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors ${
                  !notification.read ? 'bg-primary/5' : ''
                }`}
              >
                {/* Checkbox individual: marcar como leída */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!notification.read) markOneRead(notification.id);
                  }}
                  className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title={notification.read ? 'Leída' : 'Marcar como leída'}
                  aria-label={notification.read ? 'Leída' : 'Marcar como leída'}
                >
                  {notification.read ? (
                    <CheckCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <span className="text-lg shrink-0 mt-0.5">
                  {TYPE_ICONS[notification.type] || '📌'}
                </span>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handleClick(notification)}
                  >
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    {NOTE_TYPE_LABEL[notification.type] && (
                      <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {NOTE_TYPE_LABEL[notification.type]}
                      </span>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </button>
                  {/* WhatsApp button for follow-up notifications */}
                  {(notification.type === 'followup_sent' || notification.type === 'email_opened') &&
                    notification.data?.whatsappUrl && (
                      <a
                        href={notification.data.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Enviar WhatsApp
                      </a>
                    )}
                </div>
                <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                  {notification.link && (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOne(notification.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/notif:opacity-100"
                    title="Eliminar notificación"
                    aria-label="Eliminar notificación"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
