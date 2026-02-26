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
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  mention_direct: "📌",
  mention_group: "👥",
  note_thread_reply: "🧵",
  ticket_created: "🎫",
  ticket_approved: "✅",
  ticket_rejected: "❌",
  ticket_sla_breached: "🚨",
  ticket_sla_approaching: "⏳",
  refuerzo_solicitud_created: "📋",
};

const TYPE_LABELS: Record<string, string> = {
  mention: "Mención",
  mention_direct: "Mención directa",
  mention_group: "Mención grupal",
  note_thread_reply: "Respuesta de hilo",
};

type NotificationFilter = "all" | "mention_direct" | "mention_group" | "note_thread_reply";
const FILTER_TO_TYPES: Record<NotificationFilter, string[]> = {
  all: [],
  mention_direct: ["mention", "mention_direct"],
  mention_group: ["mention_group"],
  note_thread_reply: ["note_thread_reply"],
};

type ThreadContext = {
  root: {
    id: string;
    content: string;
    author?: { name?: string };
    entityType: string;
    entityId: string;
  };
  replies: Array<{
    id: string;
    content: string;
    author?: { name?: string };
  }>;
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
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NotificationItem | null>(null);
  const [threadContext, setThreadContext] = useState<ThreadContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const selectedTypes = FILTER_TO_TYPES[filter];
      const params = new URLSearchParams({ limit: "50" });
      if (selectedTypes.length > 0) {
        params.set("types", selectedTypes.join(","));
      }
      const res = await fetch(`/api/notifications?${params.toString()}`);
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
  }, [filter]);

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

  const setOneReadState = async (id: string, read: boolean) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], read }),
      });
      const previous = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
      if (!previous) return;
      if (!previous.read && read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else if (previous.read && !read) {
        setUnreadCount((prev) => prev + 1);
      }
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
    if (!n.read) void setOneReadState(n.id, true);
    if (n.link) {
      router.push(n.link);
    }
  };

  const getNotePayload = (n: NotificationItem) => {
    const data = (n.data || {}) as Record<string, unknown>;
    return {
      noteId: (data.replyNoteId as string) || (data.noteId as string) || (data.rootNoteId as string) || "",
      rootNoteId: (data.rootNoteId as string) || (data.noteId as string) || "",
      entityType: (data.entityType as string) || "",
      entityId: (data.entityId as string) || "",
    };
  };

  const canReplyInline = (n: NotificationItem) => {
    if (!["mention", "mention_direct", "mention_group", "note_thread_reply"].includes(n.type)) return false;
    const payload = getNotePayload(n);
    return Boolean(payload.noteId && payload.entityType && payload.entityId);
  };

  const openReplyModal = async (n: NotificationItem) => {
    const payload = getNotePayload(n);
    if (!payload.noteId) return;
    setReplyTarget(n);
    setReplyModalOpen(true);
    setReplyText("");
    setReplyFeedback(null);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "No se pudo cargar el hilo");
      setThreadContext(data.data as ThreadContext);
    } catch (error) {
      setThreadContext(null);
      const msg = error instanceof Error ? error.message : "No se pudo cargar el hilo";
      console.error(msg);
    } finally {
      setLoadingThread(false);
    }
  };

  const submitInlineReply = async () => {
    if (!replyTarget || !replyText.trim()) return;
    const payload = getNotePayload(replyTarget);
    const rootId = payload.rootNoteId || payload.noteId;
    setSendingReply(true);
    setReplyFeedback(null);
    try {
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: payload.entityType,
          entityId: payload.entityId,
          parentId: rootId,
          content: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "No se pudo responder");
      if (!replyTarget.read) {
        await setOneReadState(replyTarget.id, true);
      }
      setReplyText("");
      setReplyFeedback("Respuesta enviada. Contexto actualizado.");

      const refreshedThread = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const refreshedData = await refreshedThread.json();
      if (refreshedThread.ok && refreshedData.success) {
        setThreadContext(refreshedData.data as ThreadContext);
      }

      await fetchNotifications();
    } catch (error) {
      console.error("No se pudo enviar respuesta inline", error);
      setReplyFeedback("No se pudo enviar la respuesta. Intenta nuevamente.");
    } finally {
      setSendingReply(false);
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Todas
          </Button>
          <Button
            size="sm"
            variant={filter === "mention_direct" ? "default" : "outline"}
            onClick={() => setFilter("mention_direct")}
          >
            Menciones directas
          </Button>
          <Button
            size="sm"
            variant={filter === "mention_group" ? "default" : "outline"}
            onClick={() => setFilter("mention_group")}
          >
            Menciones grupales
          </Button>
          <Button
            size="sm"
            variant={filter === "note_thread_reply" ? "default" : "outline"}
            onClick={() => setFilter("note_thread_reply")}
          >
            Respuestas en hilos
          </Button>
        </div>

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
                    void setOneReadState(n.id, !n.read);
                  }}
                  className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  title={n.read ? "Marcar como no leída" : "Marcar como leída"}
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
                    {TYPE_LABELS[n.type] && (
                      <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {TYPE_LABELS[n.type]}
                      </span>
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
                  {canReplyInline(n) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openReplyModal(n);
                      }}
                      className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                    >
                      <Reply className="h-3 w-3" />
                      Responder aquí
                    </button>
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

      <Dialog open={replyModalOpen} onOpenChange={setReplyModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Responder desde notificaciones</DialogTitle>
            <DialogDescription>
              Responde sin salir del módulo y conserva el contexto del hilo.
            </DialogDescription>
          </DialogHeader>

          {loadingThread ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : threadContext ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Nota original{threadContext.root.author?.name ? ` · ${threadContext.root.author.name}` : ""}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{threadContext.root.content}</p>
              </div>
              {threadContext.replies.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border-l border-border pl-3">
                  {threadContext.replies.map((reply) => (
                    <div key={reply.id} className="rounded-md border border-border/40 bg-card p-2">
                      <p className="text-[11px] text-muted-foreground">
                        {reply.author?.name || "Usuario"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Escribe tu respuesta..."
                className="w-full min-h-[90px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {replyFeedback && (
                <p className="text-xs text-muted-foreground">{replyFeedback}</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No se pudo cargar el contexto del hilo.
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplyModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitInlineReply} disabled={!replyText.trim() || sendingReply || loadingThread || !threadContext}>
              {sendingReply && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar respuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
