"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { buildNoteContextLink, CONTEXT_LABELS, isValidContextType } from "@/lib/note-utils";
import { toast } from "sonner";
import {
  useNotesContext,
  type NoteData,
  type NoteEntityRefItem,
  type NoteReactionSummary,
} from "./NotesProvider";

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
  if (days < 30) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function isImageType(fileType?: string): boolean {
  return !!fileType && fileType.startsWith("image/");
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType?: string) {
  if (!fileType) return Paperclip;
  if (fileType.includes("pdf")) return FileText;
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return FileSpreadsheet;
  if (fileType.includes("word") || fileType.includes("document")) return FileText;
  return Paperclip;
}

/** Renders note content highlighting @mentions and #references with entity labels */
function renderContent(content: string, entityRefs?: NoteEntityRefItem[]): ReactNode {
  const refMap = new Map<string, NoteEntityRefItem>();
  if (entityRefs) {
    for (const ref of entityRefs) {
      refMap.set(`${ref.referencedEntityType}:${ref.referencedEntityId}`, ref);
    }
  }

  const parts = content.split(/([@＠][\p{L}\p{N}._\- ]+|#[A-Z_]+:[a-f0-9-]+)/gu);
  return parts.map((part, i) => {
    if (/^[@＠]/.test(part)) {
      return (
        <span key={i} className="inline-flex items-center rounded bg-emerald-500/15 border border-emerald-500/20 px-1 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {part}
        </span>
      );
    }
    const refMatch = part.match(/^#([A-Z_]+):([a-f0-9-]+)$/);
    if (refMatch) {
      const type = refMatch[1];
      const id = refMatch[2];
      const key = `${type}:${id}`;
      const refData = refMap.get(key);
      const label = refData?.referencedEntityLabel || CONTEXT_LABELS[type as keyof typeof CONTEXT_LABELS] || type;
      const href = isValidContextType(type) ? buildNoteContextLink(type as any, id) : "#";
      return (
        <Link
          key={i}
          href={href}
          className="inline-flex items-center gap-0.5 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          {label}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ─── Reaction emoji picker ─── */

const QUICK_REACTIONS = ["👍", "✅", "👀", "🔥", "❌"];

/* ─── Types ─── */

interface NoteItemProps {
  note: NoteData;
  isReply?: boolean;
  isHighlighted?: boolean;
  onReply?: (noteId: string, authorName: string) => void;
  onToggleThread?: (noteId: string) => void;
  isThreadExpanded?: boolean;
}

/* ─── Component ─── */

export function NoteItem({
  note,
  isReply,
  isHighlighted,
  onReply,
  onToggleThread,
  isThreadExpanded,
}: NoteItemProps) {
  const ctx = useNotesContext();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [togglingReaction, setTogglingReaction] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const isAuthor = note.authorId === ctx.currentUserId;
  const roleLC = ctx.currentUserRole.toLowerCase();
  const isAdmin = roleLC === "owner" || roleLC === "admin";
  const canModify = isAuthor || isAdmin;
  const [togglingTask, setTogglingTask] = useState(false);

  // ── Task metadata & toggle (before typeConfig so it can reference them) ──
  const taskMeta = note.noteType === "TASK" && note.metadata ? (note.metadata as { completed?: boolean; completedBy?: string | null; completedAt?: string | null }) : null;
  const isTaskCompleted = taskMeta?.completed === true;

  const toggleTaskComplete = useCallback(async () => {
    if (togglingTask) return;
    setTogglingTask(true);
    try {
      const nowCompleted = !isTaskCompleted;
      await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            ...((note.metadata as Record<string, unknown>) ?? {}),
            completed: nowCompleted,
            completedAt: nowCompleted ? new Date().toISOString() : null,
            completedBy: nowCompleted ? ctx.currentUserId : null,
          },
        }),
      });
      await ctx.fetchNotes();
    } catch {
      toast.error("Error al actualizar tarea");
    } finally {
      setTogglingTask(false);
    }
  }, [note.id, note.metadata, ctx, isTaskCompleted]);

  // ── Note type styling ──
  const typeConfig = {
    GENERAL: { border: "", bg: "", badge: null },
    ALERT: {
      border: "border-l-2 border-l-red-500",
      bg: "bg-red-500/5",
      badge: <span className="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400 uppercase tracking-wider">🚨 Urgente</span>,
    },
    DECISION: {
      border: "border-l-2 border-l-emerald-500",
      bg: "bg-emerald-500/5",
      badge: <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">✅ Decisión</span>,
    },
    TASK: {
      border: isTaskCompleted ? "border-l-2 border-l-emerald-400" : "border-l-2 border-l-blue-500",
      bg: isTaskCompleted ? "bg-emerald-500/5" : "bg-blue-500/5",
      badge: (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void toggleTaskComplete(); }}
          disabled={togglingTask}
          className={cn(
            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer",
            isTaskCompleted
              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25",
          )}
          title={isTaskCompleted ? "Marcar como pendiente" : "Marcar como completada"}
        >
          <CheckSquare className="h-2.5 w-2.5" />
          {isTaskCompleted ? "Completada" : "Tarea"}
          {togglingTask && <Loader2 className="h-2.5 w-2.5 animate-spin ml-0.5" />}
        </button>
      ),
    },
  };

  const tc = typeConfig[note.noteType] ?? typeConfig.GENERAL;

  // ── Edit ──
  const startEdit = () => {
    setEditContent(note.content);
    setEditing(true);
  };

  const saveEdit = useCallback(async () => {
    if (!editContent.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al editar");
      setEditing(false);
      toast.success("Nota actualizada");
      await ctx.fetchNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingEdit(false);
    }
  }, [editContent, note.id, ctx, savingEdit]);

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Error al eliminar");
      }
      setDeleteConfirm(false);
      toast.success("Nota eliminada");
      await ctx.fetchNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }, [note.id, ctx]);

  // ── Pin toggle ──
  const togglePin = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !note.isPinned }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error);
      }
      toast.success(note.isPinned ? "Nota desanclada" : "Nota anclada");
      await ctx.fetchNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }, [note.id, note.isPinned, ctx]);

  // ── Reaction toggle ──
  const toggleReaction = useCallback(async (emoji: string) => {
    if (togglingReaction) return;
    setTogglingReaction(true);
    try {
      await fetch(`/api/notes/${note.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      setShowReactions(false);
      await ctx.fetchNotes();
    } catch {
      toast.error("Error al reaccionar");
    } finally {
      setTogglingReaction(false);
    }
  }, [note.id, ctx]);

  // ── Resolve visible user names for private/group notes ──
  const visibleUserNames = useMemo(() => {
    if (note.visibility === "PUBLIC" || !note.visibleToUsers?.length) return [];
    return note.visibleToUsers
      .map((uid) => ctx.users.find((u) => u.id === uid)?.name)
      .filter(Boolean) as string[];
  }, [note.visibility, note.visibleToUsers, ctx.users]);

  return (
    <>
      <div
        id={`note-${note.id}`}
        className={cn(
          "group relative",
          isReply && "rounded-md border border-border/40 bg-muted/20 p-2.5",
          !isReply && tc.border && tc.bg && `${tc.border} ${tc.bg} rounded-md pl-3 pr-2 py-2`,
          isHighlighted && "ring-1 ring-primary/40 bg-primary/5",
        )}
        onTouchStart={() => {
          longPressTimer.current = setTimeout(() => setShowReactions(true), 500);
        }}
        onTouchEnd={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
        }}
        onTouchMove={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
        }}
      >
        {/* Pinned indicator */}
        {note.isPinned && !isReply && (
          <div className="flex items-center gap-1 mb-1 text-[10px] text-amber-500">
            <Pin className="h-2.5 w-2.5" />
            <span className="uppercase tracking-wider font-semibold">Fijada</span>
          </div>
        )}

        <div className="flex gap-2.5">
          {/* Avatar */}
          <div className="shrink-0 pt-0.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {getInitials(note.author.name)}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">{note.author.name}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
              {note.isEdited && (
                <span className="text-[10px] text-muted-foreground italic">(editada)</span>
              )}
              {/* Visibility badge with participant names */}
              {note.visibility === "PRIVATE" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500" title={visibleUserNames.length > 0 ? `Privada para: ${visibleUserNames.join(", ")}` : "Privada"}>
                  <Lock className="h-2.5 w-2.5" />
                  {visibleUserNames.length > 0 ? visibleUserNames[0] : "Privada"}
                </span>
              )}
              {note.visibility === "GROUP" && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400"
                  title={visibleUserNames.length > 0 ? `Grupo: ${visibleUserNames.join(", ")}` : "Grupo"}
                >
                  <Users className="h-2.5 w-2.5" />
                  {visibleUserNames.length > 0
                    ? visibleUserNames.length <= 2
                      ? visibleUserNames.join(", ")
                      : `${visibleUserNames.slice(0, 2).join(", ")} +${visibleUserNames.length - 2}`
                    : "Grupo"}
                </span>
              )}
              {/* Type badge */}
              {tc.badge}
            </div>

            {/* Body */}
            {editing ? (
              <div className="mt-1.5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void saveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-full min-h-[60px] resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={2}
                  autoFocus
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Button size="sm" className="h-6 text-xs px-2" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className={cn(
                  "mt-0.5 text-sm whitespace-pre-wrap break-words leading-relaxed",
                  isTaskCompleted ? "text-muted-foreground line-through" : "text-foreground/90",
                )}>
                  {renderContent(note.content, note.entityRefs)}
                </p>

                {/* Attachments */}
                {note.attachments && Array.isArray(note.attachments) && note.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(note.attachments as Array<{ fileName?: string; fileUrl?: string; fileType?: string; fileSize?: number }>).map(
                      (att, i) => {
                        if (isImageType(att.fileType)) {
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setLightboxUrl(att.fileUrl ?? null); }}
                              className="relative group/img rounded-md overflow-hidden border border-border/60 hover:border-primary/40 transition-colors"
                            >
                              <img
                                src={att.fileUrl}
                                alt={att.fileName ?? "Imagen"}
                                className="h-16 w-auto max-w-[120px] object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          );
                        }
                        const DocIcon = getFileIcon(att.fileType);
                        return (
                          <a
                            key={i}
                            href={att.fileUrl ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                          >
                            <DocIcon className="h-3.5 w-3.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate max-w-[100px] font-medium">{att.fileName ?? "Archivo"}</p>
                              {att.fileSize && <p className="text-[9px] text-muted-foreground/60">{formatFileSize(att.fileSize)}</p>}
                            </div>
                            <Download className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        );
                      },
                    )}
                  </div>
                )}

                {/* Reactions display */}
                {note.reactionSummary.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    {note.reactionSummary.map((rs: NoteReactionSummary) => {
                      const isOwn = rs.userIds.includes(ctx.currentUserId);
                      const names = rs.userIds
                        .map((uid) => ctx.users.find((u) => u.id === uid)?.name ?? (uid === ctx.currentUserId ? "Tú" : ""))
                        .filter(Boolean);
                      return (
                        <div key={rs.emoji} className="relative">
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                              isOwn
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30",
                            )}
                            onClick={() => toggleReaction(rs.emoji)}
                            onMouseEnter={() => setHoveredReaction(rs.emoji)}
                            onMouseLeave={() => setHoveredReaction(null)}
                          >
                            <span>{rs.emoji}</span>
                            <span className="font-medium">{rs.count}</span>
                          </button>
                          {/* Tooltip with names */}
                          {hoveredReaction === rs.emoji && names.length > 0 && (
                            <div className="absolute z-50 bottom-full mb-1 left-1/2 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 shadow-lg whitespace-nowrap">
                              <p className="text-[10px] text-foreground">{names.join(", ")}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions row */}
                <div className="mt-1.5 flex items-center gap-2">
                  {/* Reply button */}
                  {onReply && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => onReply(note.id, note.author.name)}
                    >
                      <CornerDownRight className="h-3 w-3" />
                      Responder
                    </button>
                  )}

                  {/* Thread indicator */}
                  {!isReply && note.replyCount > 0 && onToggleThread && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => onToggleThread(note.id)}
                    >
                      {isThreadExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <span>💬 {note.replyCount} {note.replyCount === 1 ? "respuesta" : "respuestas"}</span>
                    </button>
                  )}

                  {/* Quick reaction picker (desktop: hover, mobile: long press triggers via note wrapper) */}
                  <div className="relative ml-auto opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setShowReactions(!showReactions)}
                      title="Reaccionar"
                    >
                      😊
                    </button>
                  </div>
                  {/* Reaction picker popover */}
                  {showReactions && (
                    <div className="absolute z-50 top-0 right-8 flex items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lg">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent active:scale-110 transition-all text-sm"
                          onClick={() => toggleReaction(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Context menu */}
          {canModify && !editing && (
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Más opciones">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {isAuthor && (
                    <DropdownMenuItem onClick={startEdit}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  {!isReply && isAdmin && (
                    <DropdownMenuItem onClick={togglePin}>
                      <Pin className="h-3.5 w-3.5 mr-2" />
                      {note.isPinned ? "Desanclar" : "Fijar"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Eliminar nota"
        description="Esta nota y sus respuestas serán eliminadas permanentemente."
        onConfirm={handleDelete}
      />

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Vista ampliada"
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
