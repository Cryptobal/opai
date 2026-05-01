"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bell,
  CheckCheck,
  Circle,
  Trash2,
  ExternalLink,
  MessageSquare,
  Reply,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type NotificationItem,
  TYPE_ICONS,
  TYPE_LABELS,
  getModuleMeta,
  getRecordName,
  getContextLabel,
  isSystemNotification,
  timeAgo,
  formatExactDate,
  MODULE_SORT_ORDER,
  MODULE_BADGE_STYLES,
} from "@/lib/notification-ui-utils";
import { SoundSettingsButton } from "@/components/notifications/SoundSettings";

type NotificationFilter = "all" | "unread";

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

/* ------------------------------------------------------------------ */
/*  NotificationPopover                                                */
/* ------------------------------------------------------------------ */

export function NotificationPopover({
  compact = false,
}: {
  compact?: boolean;
}) {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading: loading,
    hasMore,
    markAsRead,
    markAsUnread,
    markAllRead: ctxMarkAllRead,
    markAllSeen,
    deleteNotification,
    deleteAll: ctxDeleteAll,
    refetch,
    loadMore,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  // Reply modal state
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NotificationItem | null>(
    null
  );
  const [threadContext, setThreadContext] = useState<ThreadContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);

  // Auto mark-seen on first open
  const seenRef = useRef(false);

  /* ---- Popover open/close ---- */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        void refetch();
        if (!seenRef.current) {
          seenRef.current = true;
          void markAllSeen();
        }
      }
    },
    [refetch, markAllSeen]
  );

  /* ---- Read / Unread toggle ---- */
  const setOneReadState = useCallback(
    async (id: string, read: boolean) => {
      const notification = notifications.find((n) => n.id === id);
      if (read) {
        await markAsRead([id]);
      } else {
        await markAsUnread([id]);
      }
      // Mark account activity as seen
      if (read && notification?.link) {
        const m = notification.link.match(/\/crm\/accounts\/([^/?]+)/);
        if (m?.[1]) {
          try {
            localStorage.setItem(
              `opai-activity-seen-${m[1]}`,
              new Date().toISOString()
            );
            window.dispatchEvent(
              new CustomEvent("opai-activity-seen", {
                detail: { accountId: m[1] },
              })
            );
          } catch {
            /* ignore */
          }
        }
      }
      // Mark note context as read for mentions
      if (
        read &&
        notification &&
        ["mention", "mention_direct", "mention_group"].includes(
          notification.type
        )
      ) {
        const data = (notification.data || {}) as Record<string, unknown>;
        const entityType =
          typeof data.entityType === "string"
            ? data.entityType.toUpperCase()
            : "";
        const entityId =
          typeof data.entityId === "string" ? data.entityId : "";
        const validContexts = [
          "LEAD",
          "ACCOUNT",
          "CONTACT",
          "DEAL",
          "QUOTATION",
          "INSTALLATION",
          "TICKET",
          "GUARD",
          "DOCUMENT",
          "OPERATION",
          "PAYROLL_RECORD",
          "RENDICION",
          "PUESTO",
          "PAUTA_MENSUAL",
          "SUPERVISION_VISIT",
        ];
        if (entityId && validContexts.includes(entityType)) {
          try {
            await fetch("/api/notes/mark-read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contextType: entityType,
                contextId: entityId,
              }),
            });
            window.dispatchEvent(new CustomEvent("opai-note-seen"));
          } catch {
            /* ignore */
          }
        }
      }
    },
    [notifications, markAsRead, markAsUnread]
  );

  /* ---- Bulk actions ---- */
  const handleMarkAllRead = async () => {
    setActionLoading(true);
    try {
      await ctxMarkAllRead();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setActionLoading(true);
    try {
      await ctxDeleteAll();
    } finally {
      setActionLoading(false);
    }
  };

  /* ---- Click navigation ---- */
  const handleClick = useCallback(
    (n: NotificationItem) => {
      if (!n.read) void setOneReadState(n.id, true);
      if (n.link) {
        setOpen(false);
        router.push(n.link);
      }
    },
    [setOneReadState, router]
  );

  /* ---- Reply helpers ---- */
  const getNotePayload = (n: NotificationItem) => {
    const data = (n.data || {}) as Record<string, unknown>;
    return {
      noteId:
        (data.replyNoteId as string) ||
        (data.noteId as string) ||
        (data.rootNoteId as string) ||
        "",
      rootNoteId:
        (data.rootNoteId as string) || (data.noteId as string) || "",
      entityType: (data.entityType as string) || "",
      entityId: (data.entityId as string) || "",
    };
  };

  const canReplyInline = (n: NotificationItem) => {
    if (!["mention"].includes(n.type)) return false;
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
      const res = await fetch(
        `/api/crm/notes/thread?noteId=${payload.noteId}`
      );
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data?.error || "No se pudo cargar el hilo");
      setThreadContext(data.data as ThreadContext);
    } catch (error) {
      setThreadContext(null);
      const msg =
        error instanceof Error ? error.message : "No se pudo cargar el hilo";
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
      if (!res.ok || !data.success)
        throw new Error(data?.error || "No se pudo responder");
      if (!replyTarget.read) {
        await setOneReadState(replyTarget.id, true);
      }
      setReplyText("");
      setReplyFeedback("Respuesta enviada. Contexto actualizado.");

      const refreshedThread = await fetch(
        `/api/crm/notes/thread?noteId=${payload.noteId}`
      );
      const refreshedData = await refreshedThread.json();
      if (refreshedThread.ok && refreshedData.success) {
        setThreadContext(refreshedData.data as ThreadContext);
      }

      await refetch();
    } catch (error) {
      console.error("No se pudo enviar respuesta inline", error);
      setReplyFeedback(
        "No se pudo enviar la respuesta. Intenta nuevamente."
      );
    } finally {
      setSendingReply(false);
    }
  };

  /* ---- Filtered list ---- */
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (filter === "unread" && n.read) return false;
        if (moduleFilter === "all") return true;
        return getModuleMeta(n).key === moduleFilter;
      }),
    [notifications, moduleFilter, filter]
  );

  /* ---- Module options (dynamic chips) ---- */
  const moduleOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const n of notifications) {
      const m = getModuleMeta(n);
      unique.set(m.key, m.label);
    }
    const sorted = Array.from(unique.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => {
        const idxA = MODULE_SORT_ORDER.indexOf(a.key);
        const idxB = MODULE_SORT_ORDER.indexOf(b.key);
        if (idxA === -1 && idxB === -1)
          return a.label.localeCompare(b.label, "es");
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    return [{ key: "all", label: "Todos" }, ...sorted];
  }, [notifications]);

  /* ---- Infinite scroll ---- */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, open]);

  /* ---- Render ---- */
  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("relative p-0", compact ? "h-8 w-8" : "h-9 w-9")}
            aria-label="Notificaciones"
          >
            <Bell className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full p-0 text-[10px] flex items-center justify-center animate-pulse"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-1rem))] min-w-0 max-w-none max-h-[70vh] p-0 overflow-hidden"
        >
          {/* -------- Header -------- */}
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
              <SoundSettingsButton />
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleMarkAllRead}
                  disabled={actionLoading}
                  title="Marcar todas como leidas"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Leidas</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDeleteAll}
                  disabled={actionLoading}
                  title="Eliminar todas"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Eliminar</span>
                </Button>
              )}
            </div>
          </div>

          {/* -------- Filters row 1: all / unread -------- */}
          <div className="border-b border-border px-3 py-2 space-y-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  filter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  filter === "unread"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                No leidas
              </button>
            </div>

            {/* -------- Filters row 2: module chips -------- */}
            {moduleOptions.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {moduleOptions.map((opt) => {
                  const isActive = moduleFilter === opt.key;
                  const chipStyle =
                    opt.key !== "all" && isActive
                      ? MODULE_BADGE_STYLES[opt.key] ||
                        MODULE_BADGE_STYLES.sistema
                      : undefined;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setModuleFilter(opt.key)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                        isActive && opt.key === "all" &&
                          "bg-primary text-primary-foreground border-primary",
                        isActive && opt.key !== "all" && chipStyle,
                        !isActive &&
                          "border-border bg-background text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* -------- Notification list -------- */}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center bg-muted/20">
              <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay notificaciones
              </p>
            </div>
          ) : (
            <div
              className="max-h-[min(50vh,400px)] overflow-y-auto divide-y divide-border/50"
            >
              {filteredNotifications.map((n) => {
                const moduleMeta = getModuleMeta(n);
                const contextLabel = getContextLabel(n);
                const isSystem = isSystemNotification(n);
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group/notif flex items-start gap-2.5 p-3 hover:bg-accent/50 transition-colors",
                      !n.read && "bg-primary/5",
                      isSystem && "border-l-2 border-status-warn-border bg-amber-500/[0.04]"
                    )}
                  >
                    {/* Read/Unread toggle circle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void setOneReadState(n.id, !n.read);
                      }}
                      className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title={n.read ? "Marcar como no leida" : "Marcar como leida"}
                      aria-label={n.read ? "Marcar como no leida" : "Marcar como leida"}
                    >
                      {n.read ? (
                        <CheckCheck className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Emoji icon */}
                    <span className="text-base shrink-0 mt-0.5">
                      {TYPE_ICONS[n.type] || "\uD83D\uDCCC"}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => handleClick(n)}
                      >
                        {/* Title + blue dot */}
                        <div className="flex items-center gap-1.5">
                          <p
                            className={cn(
                              "text-sm truncate",
                              !n.read ? "font-semibold" : "font-medium"
                            )}
                          >
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>

                        {/* Message (1-line clamp) */}
                        {n.message && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                            {n.message}
                          </p>
                        )}

                        {/* Module badge + type badge */}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center rounded-full border px-1.5 py-px text-[10px] font-medium",
                              moduleMeta.badgeClass
                            )}
                            title={contextLabel}
                          >
                            <span className="truncate max-w-[180px]">
                              {contextLabel}
                            </span>
                          </span>
                          {TYPE_LABELS[n.type] && (
                            <span className="inline-flex rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                              {TYPE_LABELS[n.type]}
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <time
                          className="block text-xs text-muted-foreground/70 mt-1"
                          dateTime={n.createdAt}
                          title={formatExactDate(n.createdAt)}
                        >
                          {timeAgo(n.createdAt)}
                        </time>
                      </button>

                      {/* WhatsApp button */}
                      {(n.type === "followup_sent" ||
                        n.type === "email_opened") &&
                        (n.data as { whatsappUrl?: string })?.whatsappUrl && (
                          <a
                            href={
                              (n.data as { whatsappUrl: string }).whatsappUrl
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 mt-1.5 rounded-full bg-status-ok-soft border border-status-ok-border px-2.5 py-0.5 text-[10px] font-medium text-status-ok-fg hover:bg-status-ok-soft transition-colors"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Enviar WhatsApp
                          </a>
                        )}

                      {/* Reply inline for mentions */}
                      {canReplyInline(n) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openReplyModal(n);
                          }}
                          className="inline-flex max-w-full items-center gap-1.5 mt-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Reply className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {`Responder en ${contextLabel}`}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Right side: delete (on hover) */}
                    <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteNotification(n.id);
                        }}
                        className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/notif:opacity-100"
                        title="Eliminar notificacion"
                        aria-label="Eliminar notificacion"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="py-3 flex items-center justify-center"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* -------- Reply Dialog -------- */}
      <Dialog open={replyModalOpen} onOpenChange={setReplyModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Responder desde notificaciones</DialogTitle>
            <DialogDescription>
              Responde sin salir del modulo y conserva el contexto del hilo.
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
                  Nota original
                  {threadContext.root.author?.name
                    ? ` \u00B7 ${threadContext.root.author.name}`
                    : ""}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {threadContext.root.content}
                </p>
              </div>
              {threadContext.replies.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border-l border-border pl-3">
                  {threadContext.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="rounded-md border border-border/40 bg-card p-2"
                    >
                      <p className="text-xs text-muted-foreground">
                        {reply.author?.name || "Usuario"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">
                        {reply.content}
                      </p>
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
                <p className="text-xs text-muted-foreground">
                  {replyFeedback}
                </p>
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
            <Button
              onClick={submitInlineReply}
              disabled={
                !replyText.trim() ||
                sendingReply ||
                loadingThread ||
                !threadContext
              }
            >
              {sendingReply && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enviar respuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
