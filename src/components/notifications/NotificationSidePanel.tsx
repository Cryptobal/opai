"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useNotifications } from "@/contexts/NotificationContext";
import { useNotificationSidePanelContext } from "./NotificationSidePanelContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsIOS } from "@/hooks/usePlatform";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { SwipeableNotificationItem } from "./SwipeableNotificationItem";
import { PullToRefresh } from "./PullToRefresh";
import {
  Bell,
  CheckCheck,
  Circle,
  Trash2,
  MessageSquare,
  Reply,
  Loader2,
  X,
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
  getContextLabel,
  isSystemNotification,
  timeAgo,
  formatExactDate,
  MODULE_SORT_ORDER,
  MODULE_BADGE_STYLES,
} from "@/lib/notification-ui-utils";
import { SoundSettingsButton } from "@/components/notifications/SoundSettings";
import { NotifConfigShortcut } from "@/components/notifications/NotifConfigShortcut";
import { NotificationItemMenu } from "@/components/notifications/NotificationItemMenu";

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

export function NotificationSidePanel() {
  const router = useRouter();
  const ctx = useNotificationSidePanelContext();
  const isIOS = useIsIOS();
  const {
    notifications,
    unreadCount,
    isLoading: loading,
    isLoadingMore,
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

  // Stable ref to loadMore so the IntersectionObserver effect doesn't
  // re-run (and re-trigger) on every notifications state change.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  // Mobile UX state
  const isMobile = useIsMobileViewport();
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timeouts = pendingDeleteTimeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  // Reply modal state
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NotificationItem | null>(null);
  const [threadContext, setThreadContext] = useState<ThreadContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);

  // Animation
  const [panelEntered, setPanelEntered] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  // Auto mark-seen on first open
  const seenRef = useRef(false);

  useEffect(() => {
    if (ctx.isPanelOpen) {
      setPanelClosing(false);
      const id = requestAnimationFrame(() => setPanelEntered(true));
      void refetch();
      if (!seenRef.current) {
        seenRef.current = true;
        void markAllSeen();
      }
      return () => cancelAnimationFrame(id);
    } else {
      setPanelEntered(false);
    }
  }, [ctx.isPanelOpen, refetch, markAllSeen]);

  // Close on Escape
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [ctx.isPanelOpen]);

  const handleClosePanel = useCallback(() => {
    if (panelClosing) return;
    setPanelClosing(true);
    setTimeout(() => {
      ctx.closePanel();
      setPanelClosing(false);
    }, 280);
  }, [ctx, panelClosing]);

  // When panel opens: default to "unread" if there are unread
  const prevPanelOpen = useRef(false);
  useEffect(() => {
    if (ctx.isPanelOpen && !prevPanelOpen.current) {
      setFilter(unreadCount > 0 ? "unread" : "all");
      setModuleFilter("all");
    }
    prevPanelOpen.current = ctx.isPanelOpen;
  }, [ctx.isPanelOpen, unreadCount]);

  /* ---- Read / Unread toggle ---- */
  const setOneReadState = useCallback(
    async (id: string, read: boolean) => {
      const notification = notifications.find((n) => n.id === id);
      if (read) {
        await markAsRead([id]);
      } else {
        await markAsUnread([id]);
      }
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
          } catch {}
        }
      }
      if (
        read &&
        notification &&
        ["mention", "mention_direct", "mention_group"].includes(notification.type)
      ) {
        const data = (notification.data || {}) as Record<string, unknown>;
        const entityType =
          typeof data.entityType === "string" ? data.entityType.toUpperCase() : "";
        const entityId =
          typeof data.entityId === "string" ? data.entityId : "";
        const validContexts = [
          "LEAD", "ACCOUNT", "CONTACT", "DEAL", "QUOTATION", "INSTALLATION",
          "TICKET", "GUARD", "DOCUMENT", "OPERATION", "PAYROLL_RECORD",
          "RENDICION", "PUESTO", "PAUTA_MENSUAL", "SUPERVISION_VISIT",
        ];
        if (entityId && validContexts.includes(entityType)) {
          try {
            await fetch("/api/notes/mark-read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contextType: entityType, contextId: entityId }),
            });
            window.dispatchEvent(new CustomEvent("opai-note-seen"));
          } catch {}
        }
      }
    },
    [notifications, markAsRead, markAsUnread]
  );

  /* ---- Mobile swipe handlers ---- */
  const handleSwipeOpenChange = useCallback((id: string, open: boolean) => {
    setOpenSwipeId(open ? id : null);
  }, []);

  const handleToggleReadMobile = useCallback(
    (n: NotificationItem) => {
      void setOneReadState(n.id, !n.read);
    },
    [setOneReadState]
  );

  const handleDeleteWithUndo = useCallback(
    (n: NotificationItem) => {
      // Optimistic UI: hide immediately via local set
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.add(n.id);
        return next;
      });

      toast("Notificacion eliminada", {
        action: {
          label: "Deshacer",
          onClick: () => {
            const timeout = pendingDeleteTimeoutsRef.current.get(n.id);
            if (timeout) clearTimeout(timeout);
            pendingDeleteTimeoutsRef.current.delete(n.id);
            setPendingDeleteIds((prev) => {
              const next = new Set(prev);
              next.delete(n.id);
              return next;
            });
          },
        },
        duration: 5000,
      });

      const timeout = setTimeout(() => {
        void deleteNotification(n.id);
        pendingDeleteTimeoutsRef.current.delete(n.id);
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(n.id);
          return next;
        });
      }, 5000);

      pendingDeleteTimeoutsRef.current.set(n.id, timeout);
    },
    [deleteNotification]
  );

  /* ---- Bulk actions ---- */
  const handleMarkAllRead = async () => {
    setActionLoading(true);
    try { await ctxMarkAllRead(); } finally { setActionLoading(false); }
  };

  const handleDeleteAll = async () => {
    setActionLoading(true);
    try { await ctxDeleteAll(); } finally { setActionLoading(false); }
  };

  /* ---- Click navigation ---- */
  const handleClick = useCallback(
    (n: NotificationItem) => {
      if (!n.read) void setOneReadState(n.id, true);
      if (n.link) {
        ctx.closePanel();
        // Compat con notificaciones antiguas que apuntaban a /opai/ops/tickets
        // (ruta inexistente; la real es /ops/tickets).
        const link = n.link.startsWith("/opai/ops/tickets")
          ? n.link.replace(/^\/opai\/ops\/tickets/, "/ops/tickets")
          : n.link;
        router.push(link);
      }
    },
    [setOneReadState, router, ctx]
  );

  /* ---- Reply helpers ---- */
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
      const res = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "No se pudo cargar el hilo");
      setThreadContext(data.data as ThreadContext);
    } catch (error) {
      setThreadContext(null);
      console.error(error instanceof Error ? error.message : "No se pudo cargar el hilo");
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
      if (!replyTarget.read) await setOneReadState(replyTarget.id, true);
      setReplyText("");
      setReplyFeedback("Respuesta enviada. Contexto actualizado.");
      const refreshedThread = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const refreshedData = await refreshedThread.json();
      if (refreshedThread.ok && refreshedData.success) setThreadContext(refreshedData.data as ThreadContext);
      await refetch();
    } catch (error) {
      console.error("No se pudo enviar respuesta inline", error);
      setReplyFeedback("No se pudo enviar la respuesta. Intenta nuevamente.");
    } finally {
      setSendingReply(false);
    }
  };

  /* ---- Filtered list ---- */
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (pendingDeleteIds.has(n.id)) return false;
        if (filter === "unread" && n.read) return false;
        if (moduleFilter === "all") return true;
        return getModuleMeta(n).key === moduleFilter;
      }),
    [notifications, moduleFilter, filter, pendingDeleteIds]
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
        if (idxA === -1 && idxB === -1) return a.label.localeCompare(b.label, "es");
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    return [{ key: "all", label: "Todos" }, ...sorted];
  }, [notifications]);

  /* ---- Infinite scroll ---- */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !ctx.isPanelOpen) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Use the stable ref so the observer doesn't need to be re-created
        // each time loadMore's identity changes (which happens on every
        // notifications state update and was causing an infinite loop).
        if (entries[0]?.isIntersecting) void loadMoreRef.current();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, ctx.isPanelOpen]);

  /* ---- Notification list content (shared desktop/mobile) ---- */
  const notificationListContent = (
    <>
      {/* Filters */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-3 py-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
              filter === "unread"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            No leidas
            {unreadCount > 0 && filter !== "unread" && (
              <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/30 px-1 text-[9px] font-bold text-primary">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Module chips */}
        {moduleOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {moduleOptions.map((opt) => {
              const isActive = moduleFilter === opt.key;
              const chipStyle =
                opt.key !== "all" && isActive
                  ? MODULE_BADGE_STYLES[opt.key] || MODULE_BADGE_STYLES.sistema
                  : undefined;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setModuleFilter(opt.key)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    isActive && opt.key === "all" && "bg-primary text-primary-foreground border-primary",
                    isActive && opt.key !== "all" && chipStyle,
                    !isActive && "border-border bg-background text-muted-foreground hover:bg-accent"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Bulk actions */}
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={actionLoading}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas leidas
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={actionLoading}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar todas
            </button>
          )}
          <div className="flex-1" />
          <NotifConfigShortcut onClick={() => ctx.closePanel()} />
          <SoundSettingsButton />
        </div>
      </div>

      {/* Notification list */}
      {(() => {
        const listInner = loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No hay notificaciones</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filteredNotifications.map((n) => {
              const moduleMeta = getModuleMeta(n);
              const contextLabel = getContextLabel(n);
              const isSystem = isSystemNotification(n);
              const itemBody = (
                <div
                  className={cn(
                    "group/notif flex items-start gap-2.5 p-3 hover:bg-accent/50 transition-colors",
                    !n.read && "bg-primary/5",
                    isSystem && "border-l-2 border-status-warn-border bg-status-warn-soft/30"
                  )}
                >
                  {/* Read/Unread toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void setOneReadState(n.id, !n.read);
                    }}
                    className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title={n.read ? "Marcar como no leida" : "Marcar como leida"}
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
                      <div className="flex items-center gap-1.5">
                        <p className={cn("text-sm truncate", !n.read ? "font-semibold" : "font-medium")}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>

                      {n.message && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex max-w-full items-center rounded-full border px-1.5 py-px text-[10px] font-medium",
                            moduleMeta.badgeClass
                          )}
                          title={contextLabel}
                        >
                          <span className="truncate max-w-[180px]">{contextLabel}</span>
                        </span>
                        {TYPE_LABELS[n.type] && (
                          <span className="inline-flex rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                            {TYPE_LABELS[n.type]}
                          </span>
                        )}
                      </div>

                      <time
                        className="block text-xs text-muted-foreground/70 mt-1"
                        dateTime={n.createdAt}
                        title={formatExactDate(n.createdAt)}
                      >
                        {timeAgo(n.createdAt)}
                      </time>
                    </button>

                    {/* WhatsApp button */}
                    {(n.type === "followup_sent" || n.type === "email_opened") &&
                      (n.data as { whatsappUrl?: string })?.whatsappUrl && (
                        <a
                          href={(n.data as { whatsappUrl: string }).whatsappUrl}
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

                  {/* Overflow menu (desktop only — mobile uses swipe) */}
                  {!isMobile && (
                    <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                      <NotificationItemMenu
                        notificationId={n.id}
                        type={n.type}
                        read={n.read}
                        onToggleRead={(read) => void setOneReadState(n.id, read)}
                        onDelete={() => void deleteNotification(n.id)}
                        onMuted={() => void refetch()}
                      />
                    </div>
                  )}
                </div>
              );
              return isMobile ? (
                <SwipeableNotificationItem
                  key={n.id}
                  id={n.id}
                  isRead={n.read}
                  isOpen={openSwipeId === n.id}
                  onOpenChange={(open) => handleSwipeOpenChange(n.id, open)}
                  onToggleRead={() => handleToggleReadMobile(n)}
                  onDelete={() => handleDeleteWithUndo(n)}
                >
                  {itemBody}
                </SwipeableNotificationItem>
              ) : (
                <div key={n.id}>{itemBody}</div>
              );
            })}

            {/* Infinite scroll sentinel — only while there is more AND we are
                 not already fetching the next page (avoids the observer firing
                 in a tight loop). */}
            {hasMore && (
              <div ref={sentinelRef} className="py-3 flex items-center justify-center">
                {isLoadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="h-4 w-4" aria-hidden />
                )}
              </div>
            )}
          </div>
        );
        return isMobile ? (
          <div className="flex-1 min-h-0">
            <PullToRefresh onRefresh={refetch}>{listInner}</PullToRefresh>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">{listInner}</div>
        );
      })()}
    </>
  );

  /* ---- Render ---- */
  return (
    <>
      {/* DESKTOP: Backdrop */}
      {ctx.isPanelOpen && (
        <div
          className="hidden xl:block fixed inset-0 z-30"
          onClick={ctx.closePanel}
          aria-hidden="true"
        />
      )}

      {/* MOBILE: Full-screen overlay */}
      {ctx.isPanelOpen && (
        <>
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40 xl:hidden transition-opacity duration-300",
              panelEntered && !panelClosing ? "opacity-100" : "opacity-0"
            )}
            onClick={handleClosePanel}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed inset-0 z-50 xl:hidden flex flex-col transition-transform duration-300 ease-out",
              isIOS ? "opai-ios-surface-sheet-side" : "bg-background",
              panelEntered && !panelClosing ? "translate-x-0" : "translate-x-full"
            )}
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: "var(--bottom-nav-height, 0px)",
              paddingTop: "env(safe-area-inset-top)",
            }}
            role="dialog"
            aria-label="Panel de notificaciones"
          >
            {/* Mobile header */}
            <div className="shrink-0 flex flex-col border-b border-border/50">
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/20" aria-hidden />
              </div>
              <div className="flex items-center justify-between h-12 px-4 pb-2">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-semibold">Notificaciones</h3>
                  {unreadCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleClosePanel}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mobile content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {notificationListContent}
            </div>
          </div>
        </>
      )}

      {/* DESKTOP: Right side panel */}
      <div
        className={cn(
          "hidden xl:flex fixed top-0 right-0 h-full w-[400px] z-40 flex-col",
          isIOS
            ? "opai-ios-surface-sheet-side"
            : "bg-background border-l border-border/50 shadow-[-8px_0_30px_-12px_rgba(0,0,0,0.25)]",
          "transition-transform duration-300 ease-out",
          ctx.isPanelOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
        role="dialog"
        aria-label="Panel de notificaciones"
      >
        {/* Desktop header */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border/50 shrink-0">
          <Bell className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">Notificaciones</h2>
          </div>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={ctx.closePanel}
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Desktop content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {notificationListContent}
        </div>
      </div>

      {/* Reply Dialog */}
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
                  {threadContext.root.author?.name ? ` \u00B7 ${threadContext.root.author.name}` : ""}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{threadContext.root.content}</p>
              </div>
              {threadContext.replies.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border-l border-border pl-3">
                  {threadContext.replies.map((reply) => (
                    <div key={reply.id} className="rounded-md border border-border/40 bg-card p-2">
                      <p className="text-xs text-muted-foreground">{reply.author?.name || "Usuario"}</p>
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
            <Button
              onClick={submitInlineReply}
              disabled={!replyText.trim() || sendingReply || loadingThread || !threadContext}
            >
              {sendingReply && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar respuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
