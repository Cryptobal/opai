"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ExternalLink,
  Loader2,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Send,
  Trash2,
  Users,
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

/** Renders note content highlighting @mentions and #references with entity labels */
function renderContent(content: string, entityRefs?: NoteEntityRefItem[]): ReactNode {
  // Build a lookup map: "TYPE:id" → ref data
  const refMap = new Map<string, NoteEntityRefItem>();
  if (entityRefs) {
    for (const ref of entityRefs) {
      refMap.set(`${ref.referencedEntityType}:${ref.referencedEntityId}`, ref);
    }
  }

  // Split on @mentions and #REF:id patterns
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

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];

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

  const isAuthor = note.authorId === ctx.currentUserId;
  const isAdmin = ctx.currentUserRole === "ADMIN" || ctx.currentUserRole === "SUPER_ADMIN";
  const canModify = isAuthor || isAdmin;

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
      border: "border-l-2 border-l-blue-500",
      bg: "bg-blue-500/5",
      badge: (
        <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
          <CheckSquare className="h-2.5 w-2.5" /> Tarea
        </span>
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
    if (!editContent.trim()) return;
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
  }, [editContent, note.id, ctx]);

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
  }, [note.id, ctx, togglingReaction]);

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
              {/* Visibility badge */}
              {note.visibility === "PRIVATE" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" /> Privada
                </span>
              )}
              {note.visibility === "GROUP" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Users className="h-2.5 w-2.5" /> Grupo
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
                <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                  {renderContent(note.content, note.entityRefs)}
                </p>

                {/* Attachments */}
                {note.attachments && Array.isArray(note.attachments) && note.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(note.attachments as Array<{ fileName?: string; fileUrl?: string; fileType?: string }>).map(
                      (att, i) => (
                        <a
                          key={i}
                          href={att.fileUrl ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Paperclip className="h-2.5 w-2.5" />
                          {att.fileName ?? "Archivo"}
                        </a>
                      ),
                    )}
                  </div>
                )}

                {/* Reactions display */}
                {note.reactionSummary.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    {note.reactionSummary.map((rs: NoteReactionSummary) => {
                      const isOwn = rs.userIds.includes(ctx.currentUserId);
                      return (
                        <button
                          key={rs.emoji}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                            isOwn
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30",
                          )}
                          onClick={() => toggleReaction(rs.emoji)}
                        >
                          <span>{rs.emoji}</span>
                          <span className="font-medium">{rs.count}</span>
                        </button>
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

                  {/* Quick reaction button */}
                  <div className="relative ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setShowReactions(!showReactions)}
                      title="Reaccionar"
                    >
                      😊
                    </button>
                    {showReactions && (
                      <div className="absolute z-50 bottom-full mb-1 right-0 flex items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lg">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors text-sm"
                            onClick={() => toggleReaction(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
    </>
  );
}
