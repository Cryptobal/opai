/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, MoreHorizontal, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

/* ─── Types ─── */

type NoteUser = { id: string; name: string; email?: string };

type Note = {
  id: string;
  content: string;
  mentions: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  author: NoteUser;
  mentionNames: string[];
};

interface NotesSectionProps {
  entityType: "account" | "contact" | "deal" | "quote" | "ops_guardia";
  entityId: string;
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
  if (days < 30) return `hace ${days}d`;
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

/** Renders note content highlighting @mentions */
function renderContent(content: string): React.ReactNode {
  const parts = content.split(/(@\w[\w\s]*?)(?=\s|$|@)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
}

/* ─── Component ─── */

export function NotesSection({ entityType, entityId, currentUserId }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  // @mention state
  const [users, setUsers] = useState<NoteUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionTarget, setMentionTarget] = useState<"new" | "edit">("new");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch notes
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/notes?entityType=${entityType}&entityId=${entityId}`);
      const data = await res.json();
      if (data.success) setNotes(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Fetch users for @mentions
  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => { if (d.success) setUsers(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Extract mentions from content
  const extractMentions = (content: string): string[] => {
    const mentionedNames = content.match(/@([\w\s]+?)(?=\s@|\s*$)/g) || [];
    const ids: string[] = [];
    for (const m of mentionedNames) {
      const name = m.slice(1).trim();
      const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
      if (user) ids.push(user.id);
    }
    return ids;
  };

  // Handle @ detection in textarea
  const handleTextChange = (value: string, target: "new" | "edit") => {
    if (target === "new") setNewNote(value);
    else setEditContent(value);

    const ref = target === "new" ? textareaRef.current : editTextareaRef.current;
    if (!ref) return;

    const cursorPos = ref.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
      setShowMentions(true);
      setMentionTarget(target);
      setSelectedMentionIdx(0);
    } else {
      setShowMentions(false);
    }
  };

  const filteredUsers = users.filter(
    (u) => u.name.toLowerCase().includes(mentionQuery) || u.email?.toLowerCase().includes(mentionQuery)
  );

  const insertMention = (user: NoteUser) => {
    const target = mentionTarget;
    const value = target === "new" ? newNote : editContent;
    const ref = target === "new" ? textareaRef.current : editTextareaRef.current;
    if (!ref) return;

    const cursorPos = ref.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const before = value.slice(0, atIndex);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${user.name} ${after}`;

    if (target === "new") setNewNote(newValue);
    else setEditContent(newValue);

    setShowMentions(false);
    setTimeout(() => {
      const newCursorPos = atIndex + user.name.length + 2;
      ref.setSelectionRange(newCursorPos, newCursorPos);
      ref.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentions || filteredUsers.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIdx((i) => Math.min(i + 1, filteredUsers.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredUsers[selectedMentionIdx]);
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  };

  // Create note
  const createNote = async () => {
    if (!newNote.trim()) return;
    setSending(true);
    try {
      const mentions = extractMentions(newNote);
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, content: newNote, mentions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      setNotes((prev) => [data.data, ...prev]);
      setNewNote("");
      toast.success("Nota agregada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear la nota";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // Update note
  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      const mentions = extractMentions(editContent);
      const res = await fetch(`/api/crm/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, mentions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setNotes((prev) =>
        prev.map((n) => (n.id === editingId ? { ...n, content: editContent.trim(), updatedAt: new Date().toISOString() } : n))
      );
      setEditingId(null);
      toast.success("Nota actualizada");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo actualizar";
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete note
  const deleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error);
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Nota eliminada");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo eliminar";
      toast.error(msg);
    }
  };

  // Mention dropdown (shared between new & edit)
  const MentionDropdown = () => {
    if (!showMentions || filteredUsers.length === 0) return null;
    return (
      <div className="absolute z-50 bottom-full mb-1 left-0 w-64 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
        {filteredUsers.slice(0, 8).map((user, i) => (
          <button
            key={user.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              i === selectedMentionIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary shrink-0">
              {getInitials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">{user.name}</p>
              {user.email && <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── New note input ── */}
      <div className="relative">
        <div className="relative">
          <MentionDropdown />
          <textarea
            ref={textareaRef}
            value={newNote}
            onChange={(e) => handleTextChange(e.target.value, "new")}
            onKeyDown={(e) => {
              if (showMentions) {
                handleKeyDown(e);
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                createNote();
              }
            }}
            placeholder="Escribe una nota... usa @ para mencionar"
            className="w-full min-h-[72px] resize-none rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            rows={2}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1.5 bottom-1.5 h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={createNote}
            disabled={sending || !newNote.trim()}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border px-1 py-0.5 text-[9px]">Ctrl</kbd>+<kbd className="rounded border border-border px-1 py-0.5 text-[9px]">Enter</kbd> para enviar
        </p>
      </div>

      {/* ── Notes list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <MessageSquareText className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Sin notas aún</p>
        </div>
      ) : (
        <div className="space-y-0">
          {notes.map((note, idx) => (
            <div
              key={note.id}
              className={`group flex gap-3 py-3 ${idx < notes.length - 1 ? "border-b border-border/50" : ""}`}
            >
              {/* Avatar */}
              <div className="shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                  {getInitials(note.author.name)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{note.author.name}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
                  {note.updatedAt !== note.createdAt && (
                    <span className="text-[10px] text-muted-foreground italic">(editada)</span>
                  )}
                </div>

                {editingId === note.id ? (
                  <div className="mt-1.5 relative">
                    {mentionTarget === "edit" && <MentionDropdown />}
                    <textarea
                      ref={editTextareaRef}
                      value={editContent}
                      onChange={(e) => handleTextChange(e.target.value, "edit")}
                      onKeyDown={(e) => {
                        if (showMentions) handleKeyDown(e);
                        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
                        else if (e.key === "Escape") setEditingId(null);
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
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap break-words">
                    {renderContent(note.content)}
                  </p>
                )}
              </div>

              {/* Actions */}
              {note.createdBy === currentUserId && editingId !== note.id && (
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(note.id);
                          setEditContent(note.content);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteConfirm({ open: true, id: note.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar nota"
        description="Esta nota será eliminada permanentemente."
        onConfirm={() => deleteNote(deleteConfirm.id)}
      />
    </div>
  );
}
