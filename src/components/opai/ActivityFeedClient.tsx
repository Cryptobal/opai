"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Eye,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface ActivityNote {
  id: string;
  contextType: string;
  contextId: string;
  contextLabel: string;
  contextLink: string;
  contextModule: string;
  authorId: string;
  content: string;
  noteType: "GENERAL" | "ALERT" | "DECISION" | "TASK";
  visibility: "PUBLIC" | "PRIVATE" | "GROUP";
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  author: { id: string; name: string; email: string };
  replyCount: number;
  reactionCount: number;
  isMentioned: boolean;
  isRead: boolean;
}

interface ActivityFeedClientProps {
  currentUserId: string;
}

/* ─── Helpers ─── */

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function buildActionText(note: ActivityNote, currentUserId: string): string {
  const authorName = note.author.name.split(" ")[0];
  if (note.isMentioned) return `${authorName} te mencionó en`;
  if (note.noteType === "ALERT") return `${authorName} escribió una alerta en`;
  if (note.noteType === "DECISION") return `${authorName} registró una decisión en`;
  if (note.noteType === "TASK") {
    const meta = note.metadata as { completed?: boolean } | null;
    if (meta?.completed) return `${authorName} completó una tarea en`;
    return `${authorName} asignó una tarea en`;
  }
  return `${authorName} escribió una nota en`;
}

const NOTE_TYPE_ICONS: Record<string, { icon: typeof MessageSquare; color: string }> = {
  GENERAL: { icon: MessageSquareText, color: "text-muted-foreground" },
  ALERT: { icon: AlertTriangle, color: "text-red-500" },
  DECISION: { icon: CheckCircle2, color: "text-emerald-500" },
  TASK: { icon: CheckSquare, color: "text-blue-500" },
};

/* ─── Filter tabs ─── */

type FilterTab = "all" | "mentions" | "alerts" | "decisions" | "tasks";
const FILTER_TABS: Array<{ value: FilterTab; label: string; icon?: string }> = [
  { value: "all", label: "Todas" },
  { value: "mentions", label: "Menciones", icon: "@" },
  { value: "alerts", label: "Alertas", icon: "🚨" },
  { value: "decisions", label: "Decisiones", icon: "✅" },
  { value: "tasks", label: "Tareas", icon: "📋" },
];

/* ─── Component ─── */

export function ActivityFeedClient({ currentUserId }: ActivityFeedClientProps) {
  const [notes, setNotes] = useState<ActivityNote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch activity ──
  const fetchActivity = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          filter,
          page: String(pageNum),
          limit: "30",
          ...(showUnreadOnly ? { read: "false" } : {}),
        });
        const res = await fetch(`/api/notes/activity?${params}`);
        const json = await res.json();
        if (json.success) {
          if (append) {
            setNotes((prev) => [...prev, ...json.data]);
          } else {
            setNotes(json.data);
          }
          setTotal(json.meta.total);
          setTotalPages(json.meta.totalPages);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, showUnreadOnly],
  );

  useEffect(() => {
    setPage(1);
    void fetchActivity(1);
  }, [fetchActivity]);

  // ── Load more ──
  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    void fetchActivity(next, true);
  };

  // ── Mark single note as read ──
  const markAsRead = useCallback(
    async (note: ActivityNote) => {
      if (note.isRead || note.authorId === currentUserId) return;
      // Optimistic update
      setNotes((prev) =>
        prev.map((n) =>
          n.contextType === note.contextType && n.contextId === note.contextId
            ? { ...n, isRead: true }
            : n,
        ),
      );
      try {
        await fetch("/api/notes/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextType: note.contextType,
            contextId: note.contextId,
          }),
        });
        window.dispatchEvent(new CustomEvent("opai-note-seen"));
      } catch {
        // revert on error
        void fetchActivity(1);
      }
    },
    [currentUserId, fetchActivity],
  );

  // ── Mark all as read ──
  const markAllAsRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      // Get unique unread contexts
      const unreadContexts = new Map<string, { contextType: string; contextId: string }>();
      for (const n of notes) {
        if (!n.isRead && n.authorId !== currentUserId) {
          const key = `${n.contextType}:${n.contextId}`;
          if (!unreadContexts.has(key)) {
            unreadContexts.set(key, { contextType: n.contextType, contextId: n.contextId });
          }
        }
      }

      // Mark each context as read
      await Promise.allSettled(
        Array.from(unreadContexts.values()).map((c) =>
          fetch("/api/notes/mark-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(c),
          }),
        ),
      );

      // Optimistic update
      setNotes((prev) => prev.map((n) => ({ ...n, isRead: true })));
      window.dispatchEvent(new CustomEvent("opai-note-seen"));
    } catch {
      // silent
    } finally {
      setMarkingAll(false);
    }
  }, [notes, currentUserId]);

  const unreadCount = useMemo(() => notes.filter((n) => !n.isRead).length, [notes]);

  return (
    <div ref={containerRef} className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Type filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                filter === tab.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.icon && <span className="text-[11px]">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Unread toggle */}
          <button
            type="button"
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              showUnreadOnly
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Eye className="h-3 w-3" />
            No leídas
            {unreadCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Mark all read */}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={markAllAsRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Marcar todas como leídas
            </Button>
          )}
        </div>
      </div>

      {/* ── Feed ── */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando actividad...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/20" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Sin actividad</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {showUnreadOnly
                ? "No tienes notas sin leer"
                : "Las notas de las entidades que sigues aparecerán aquí"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {notes.map((note) => {
            const TypeIcon = NOTE_TYPE_ICONS[note.noteType]?.icon ?? MessageSquareText;
            const iconColor = NOTE_TYPE_ICONS[note.noteType]?.color ?? "text-muted-foreground";

            return (
              <Link
                key={note.id}
                href={`${note.contextLink}?openNotes=true`}
                onClick={() => markAsRead(note)}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent/50",
                  note.isRead
                    ? "border-border/40 bg-background"
                    : "border-primary/20 bg-primary/[0.02]",
                )}
              >
                {/* Avatar */}
                <div className="shrink-0 pt-0.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium",
                      note.isRead
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {getInitials(note.author.name)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Action line */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
                    <p className="text-sm">
                      <span className={cn("font-medium", !note.isRead && "text-foreground")}>
                        {buildActionText(note, currentUserId)}
                      </span>{" "}
                      <span className="font-semibold text-primary hover:underline">
                        {note.contextLabel}
                      </span>
                    </p>
                  </div>

                  {/* Module label */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                      {note.contextLabel} · {note.contextModule}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {timeAgo(note.createdAt)}
                    </span>
                  </div>

                  {/* Content preview */}
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {note.content.replace(/#[A-Z_]+:[a-f0-9-]+/g, "").replace(/[@＠][\p{L}\p{N}._\- ]+/gu, (m) => m).slice(0, 150)}
                  </p>

                  {/* Engagement stats */}
                  {(note.replyCount > 0 || note.reactionCount > 0 || note.isMentioned) && (
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      {note.replyCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {note.replyCount}
                        </span>
                      )}
                      {note.isMentioned && (
                        <span className="inline-flex items-center gap-0.5 text-amber-500">
                          <AtSign className="h-3 w-3" />
                          Te mencionaron
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Unread indicator dot */}
                {!note.isRead && (
                  <div className="shrink-0 pt-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </Link>
            );
          })}

          {/* Load more */}
          {page < totalPages && (
            <div className="flex justify-center pt-4 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Cargar más
              </Button>
            </div>
          )}

          {/* Summary */}
          <div className="text-center py-2">
            <p className="text-[11px] text-muted-foreground/60">
              Mostrando {notes.length} de {total} notas
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
