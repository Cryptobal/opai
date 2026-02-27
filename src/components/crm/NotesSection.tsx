/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

/* ─── Types ─── */

type NoteUser = { id: string; name: string; email?: string };
type NoteGroup = {
  id: string;
  name: string;
  slug: string;
  color?: string;
  memberIds: string[];
  memberCount: number;
};
type MentionSpecial = {
  id: string;
  key: string;
  label: string;
  aliases: string[];
  token: string;
};
type MentionOption =
  | ({ kind: "special" } & MentionSpecial)
  | ({ kind: "group" } & NoteGroup)
  | ({ kind: "user" } & NoteUser);

type Note = {
  id: string;
  content: string;
  mentions: string[];
  mentionMeta?: Record<string, unknown> | null;
  parentId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  author: NoteUser;
  mentionNames: string[];
  replies: Note[];
};

interface NotesSectionProps {
  entityType: "account" | "contact" | "deal" | "quote" | "ops_guardia" | "installation_pauta" | "installation";
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
    return <span key={i}>{part}</span>;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMention(content: string, rawValue: string): boolean {
  const value = rawValue.trim();
  if (!value) return false;
  const escaped = escapeRegex(value);
  const pattern = new RegExp(`(?:^|\\s)[@＠]${escaped}(?=\\s|$|[.,;:!?])`, "iu");
  return pattern.test(content.replace(/\u00A0/g, " "));
}

/* ─── Component ─── */

export function NotesSection({ entityType, entityId, currentUserId }: NotesSectionProps) {
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  // @mention state
  const [users, setUsers] = useState<NoteUser[]>([]);
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [specialMentions, setSpecialMentions] = useState<MentionSpecial[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionTarget, setMentionTarget] = useState<"new" | "edit" | "reply">("new");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const seenRootNoteIdsRef = useRef<Set<string>>(new Set());

  // Fetch notes
  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/crm/notes?entityType=${entityType}&entityId=${entityId}`);
      const data = await res.json();
      if (data.success) setNotes(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Fetch mention options (special + groups + users)
  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUsers(d.data?.users || []);
          setGroups(d.data?.groups || []);
          setSpecialMentions(d.data?.special || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const groupedMentionOptions = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    const special = specialMentions
      .filter((item) => {
        if (!query) return true;
        return (
          item.label.toLowerCase().includes(query) ||
          item.token.toLowerCase().includes(query) ||
          item.aliases.some((alias) => alias.toLowerCase().includes(query))
        );
      })
      .map((item) => ({ ...item, kind: "special" as const }));
    const groupsFiltered = groups
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.slug.toLowerCase().includes(query)
        );
      })
      .map((item) => ({ ...item, kind: "group" as const }));
    const usersFiltered = users
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.email?.toLowerCase().includes(query)
        );
      })
      .map((item) => ({ ...item, kind: "user" as const }));
    return {
      special,
      groups: groupsFiltered,
      users: usersFiltered,
      all: [...special, ...groupsFiltered, ...usersFiltered] as MentionOption[],
    };
  }, [groups, mentionQuery, specialMentions, users]);

  const buildMentionPayload = useCallback((content: string) => {
    const includeAll = /(?:^|\s)[@＠](todos|all)(?=\s|$|[.,;:!?])/iu.test(content);
    const mentionedUserIds = users
      .filter((user) => hasMention(content, user.name) || (user.email ? hasMention(content, user.email) : false))
      .map((user) => user.id);
    const mentionedGroupIds = groups
      .filter((group) => hasMention(content, group.name) || hasMention(content, group.slug))
      .map((group) => group.id);
    const groupMemberIds = groups
      .filter((group) => mentionedGroupIds.includes(group.id))
      .flatMap((group) => group.memberIds);
    const recipients = includeAll
      ? users.map((user) => user.id).filter((id) => id !== currentUserId)
      : [...new Set([...mentionedUserIds, ...groupMemberIds])].filter((id) => id !== currentUserId);
    return {
      mentions: recipients,
      mentionMeta: {
        includeAll,
        userIds: mentionedUserIds,
        groupIds: mentionedGroupIds,
      },
    };
  }, [groups, users, currentUserId]);

  // Handle @ detection in textarea
  const handleTextChange = (value: string, target: "new" | "edit" | "reply") => {
    if (target === "new") setNewNote(value);
    else if (target === "edit") setEditContent(value);
    else setReplyContent(value);

    const ref =
      target === "new"
        ? textareaRef.current
        : target === "edit"
          ? editTextareaRef.current
          : replyTextareaRef.current;
    if (!ref) return;

    const cursorPos = ref.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos).replace(/\u00A0/g, " ");
    // Mobile keyboards can emit full-width @ (＠) and names with accents.
    const atMatch = textBeforeCursor.match(/(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u);

    if (atMatch) {
      setMentionQuery((atMatch[1] || "").toLowerCase());
      setShowMentions(true);
      setMentionTarget(target);
      setSelectedMentionIdx(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (option: MentionOption) => {
    const target = mentionTarget;
    const value = target === "new" ? newNote : editContent;
    const activeValue = target === "reply" ? replyContent : value;
    const activeRef =
      target === "new"
        ? textareaRef.current
        : target === "edit"
          ? editTextareaRef.current
          : replyTextareaRef.current;
    if (!activeRef) return;

    const cursorPos = activeRef.selectionStart ?? activeValue.length;
    const textBeforeCursor = activeValue.slice(0, cursorPos);
    const lastAsciiAt = textBeforeCursor.lastIndexOf("@");
    const lastFullAt = textBeforeCursor.lastIndexOf("＠");
    const fallbackAt = Math.max(lastAsciiAt, lastFullAt);
    const atMatch = textBeforeCursor.match(/(?:^|\s)[@＠]([\p{L}\p{N}._-]*)$/u);
    let atIndex = fallbackAt;
    if (atMatch) {
      const segment = atMatch[0] || "";
      atIndex = cursorPos - segment.length + (segment.startsWith(" ") ? 1 : 0);
    }

    const mentionLabel =
      option.kind === "special" ? option.token : option.name;
    const before = activeValue.slice(0, Math.max(0, atIndex));
    const after = activeValue.slice(cursorPos);
    const newValue = `${before}@${mentionLabel} ${after}`;

    if (target === "new") setNewNote(newValue);
    else if (target === "edit") setEditContent(newValue);
    else setReplyContent(newValue);

    setShowMentions(false);
    setTimeout(() => {
      const newCursorPos = Math.max(0, atIndex) + mentionLabel.length + 2;
      activeRef.setSelectionRange(newCursorPos, newCursorPos);
      activeRef.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentions || groupedMentionOptions.all.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIdx((i) => Math.min(i + 1, groupedMentionOptions.all.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(groupedMentionOptions.all[selectedMentionIdx]);
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  };

  // Create note
  const createNote = async () => {
    if (!newNote.trim()) return;
    setSending(true);
    try {
      const mentionPayload = buildMentionPayload(newNote);
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          content: newNote.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      await fetchNotes();
      setNewNote("");
      toast.success("Nota agregada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear la nota";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const createReply = async () => {
    if (!replyingToId || !replyContent.trim()) return;
    setReplySending(true);
    try {
      const mentionPayload = buildMentionPayload(replyContent);
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          parentId: replyingToId,
          content: replyContent.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al responder");
      await fetchNotes();
      setReplyContent("");
      setReplyingToId(null);
      toast.success("Respuesta enviada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo responder";
      toast.error(msg);
    } finally {
      setReplySending(false);
    }
  };

  // Update note
  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      const mentionPayload = buildMentionPayload(editContent);
      const res = await fetch(`/api/crm/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      await fetchNotes();
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
      await fetchNotes();
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Nota eliminada");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo eliminar";
      toast.error(msg);
    }
  };

  const markRootNoteSeen = useCallback(async (rootNoteId: string) => {
    if (!rootNoteId || seenRootNoteIdsRef.current.has(rootNoteId)) return;
    seenRootNoteIdsRef.current.add(rootNoteId);
    try {
      await fetch("/api/crm/notes/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds: [rootNoteId], read: true }),
      });
      window.dispatchEvent(new CustomEvent("opai-note-seen", { detail: { noteId: rootNoteId } }));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (notes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const rootNoteId = (entry.target as HTMLElement).dataset.rootNoteId;
          if (rootNoteId) {
            void markRootNoteSeen(rootNoteId);
          }
        }
      },
      { threshold: 0.45 }
    );
    const elements = document.querySelectorAll<HTMLElement>("[data-note-id]");
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [notes, markRootNoteSeen]);

  const resolveRootNoteId = useCallback((noteId: string): string | null => {
    for (const note of notes) {
      if (note.id === noteId) return note.id;
      if (note.replies.some((reply) => reply.id === noteId)) return note.id;
    }
    return null;
  }, [notes]);

  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (!noteId || notes.length === 0) return;

    const replyTo = searchParams.get("replyTo");
    const focusReply = searchParams.get("focusReply") === "1";
    const rootNoteId = replyTo || resolveRootNoteId(noteId) || noteId;

    if (focusReply) {
      setReplyingToId(rootNoteId);
      setExpandedThreads((prev) => new Set([...prev, rootNoteId]));
      setTimeout(() => {
        replyTextareaRef.current?.focus();
      }, 180);
    }

    setHighlightedNoteId(noteId);
    setTimeout(() => setHighlightedNoteId(null), 4500);

    void markRootNoteSeen(rootNoteId);
    requestAnimationFrame(() => {
      const target =
        document.getElementById(`note-${noteId}`) ||
        document.getElementById(`note-${rootNoteId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [markRootNoteSeen, notes, resolveRootNoteId, searchParams]);

  // Mention dropdown (shared between new & edit)
  const MentionDropdown = () => {
    if (!showMentions || groupedMentionOptions.all.length === 0) return null;

    let optionCursor = 0;
    const renderOption = (option: MentionOption) => {
      const idx = optionCursor++;
      const isSelected = idx === selectedMentionIdx;

      if (option.kind === "special") {
        return (
          <button
            key={`special-${option.id}`}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onMouseDown={(e) => { e.preventDefault(); insertMention(option); }}
            onClick={() => insertMention(option)}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <AtSign className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">@{option.label}</p>
              <p className="truncate text-[10px] text-muted-foreground">Notificar a todos los usuarios activos</p>
            </div>
          </button>
        );
      }

      if (option.kind === "group") {
        return (
          <button
            key={`group-${option.id}`}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onMouseDown={(e) => { e.preventDefault(); insertMention(option); }}
            onClick={() => insertMention(option)}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 shrink-0">
              <Users className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">{option.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{option.memberCount} miembro(s)</p>
            </div>
          </button>
        );
      }

      return (
        <button
          key={`user-${option.id}`}
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          }`}
          onMouseDown={(e) => { e.preventDefault(); insertMention(option); }}
          onClick={() => insertMention(option)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary shrink-0">
            {getInitials(option.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-xs">{option.name}</p>
            {option.email && <p className="truncate text-[10px] text-muted-foreground">{option.email}</p>}
          </div>
        </button>
      );
    };

    return (
      <div className="absolute z-[100] top-full mt-1 left-0 w-72 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
        {groupedMentionOptions.special.length > 0 && (
          <div>
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Especial</p>
            {groupedMentionOptions.special.map((option) => renderOption(option))}
          </div>
        )}
        {groupedMentionOptions.groups.length > 0 && (
          <div>
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Grupos</p>
            {groupedMentionOptions.groups.map((option) => renderOption(option))}
          </div>
        )}
        {groupedMentionOptions.users.length > 0 && (
          <div>
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Usuarios</p>
            {groupedMentionOptions.users.map((option) => renderOption(option))}
          </div>
        )}
      </div>
    );
  };

  const renderNote = (note: Note, opts: { rootId: string; isReply?: boolean }) => {
    const isReply = opts.isReply ?? false;
    const isHighlighted = highlightedNoteId === note.id;
    const canEdit = note.createdBy === currentUserId && editingId !== note.id;
    return (
      <div
        id={`note-${note.id}`}
        data-note-id={note.id}
        data-root-note-id={opts.rootId}
        key={note.id}
        className={`${isReply ? "rounded-md border border-border/40 bg-muted/20 p-2.5" : ""} ${
          isHighlighted ? "ring-1 ring-primary/40 bg-primary/5" : ""
        }`}
      >
        <div className="group flex gap-3">
          <div className="shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {getInitials(note.author.name)}
            </div>
          </div>
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
                    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(); }
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
              <>
                <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap break-words">
                  {renderContent(note.content)}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setReplyingToId(opts.rootId);
                      setExpandedThreads((prev) => new Set([...prev, opts.rootId]));
                      setTimeout(() => replyTextareaRef.current?.focus(), 120);
                    }}
                  >
                    <CornerDownRight className="h-3 w-3" />
                    Responder
                  </button>
                </div>
              </>
            )}
          </div>

          {canEdit && (
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Más opciones" title="Más opciones">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingId(note.id);
                      setEditContent(note.content);
                      setMentionTarget("edit");
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
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── New note input ── */}
      <div className="relative">
        <div className="relative">
          {mentionTarget === "new" && <MentionDropdown />}
          <textarea
            ref={textareaRef}
            value={newNote}
            onChange={(e) => handleTextChange(e.target.value, "new")}
            onKeyDown={(e) => {
              if (showMentions) {
                handleKeyDown(e);
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void createNote();
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
            aria-label="Enviar nota"
            title="Enviar nota"
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
          {notes.map((note, idx) => {
            const hasManyReplies = note.replies.length > 3;
            const isExpanded = expandedThreads.has(note.id);
            const visibleReplies =
              hasManyReplies && !isExpanded ? note.replies.slice(-2) : note.replies;
            const hiddenRepliesCount =
              hasManyReplies && !isExpanded ? note.replies.length - visibleReplies.length : 0;
            return (
            <div
              key={note.id}
              className={`group flex gap-3 py-3 ${idx < notes.length - 1 ? "border-b border-border/50" : ""}`}
            >
              <div className="flex-1">
                {renderNote(note, { rootId: note.id })}

                {note.replies.length > 0 && (
                  <div className="ml-8 mt-2 border-l border-border/60 pl-3 space-y-2">
                    {hasManyReplies && (
                      <button
                        type="button"
                        className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setExpandedThreads((prev) => {
                            const next = new Set(prev);
                            if (next.has(note.id)) next.delete(note.id);
                            else next.add(note.id);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {isExpanded
                          ? `Ocultar respuestas (${note.replies.length})`
                          : `${hiddenRepliesCount} respuestas más`}
                      </button>
                    )}
                    {visibleReplies.map((reply) => renderNote(reply, { rootId: note.id, isReply: true }))}
                  </div>
                )}

                {replyingToId === note.id && (
                  <div className="ml-8 mt-2 relative">
                    {mentionTarget === "reply" && <MentionDropdown />}
                    <textarea
                      ref={replyTextareaRef}
                      value={replyContent}
                      onChange={(e) => handleTextChange(e.target.value, "reply")}
                      onKeyDown={(e) => {
                        if (showMentions) {
                          handleKeyDown(e);
                        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void createReply();
                        } else if (e.key === "Escape") {
                          setReplyingToId(null);
                          setReplyContent("");
                        }
                      }}
                      placeholder="Escribe una respuesta..."
                      className="w-full min-h-[62px] resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      rows={2}
                    />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Button size="sm" className="h-6 text-xs px-2" onClick={createReply} disabled={replySending || !replyContent.trim()}>
                        {replySending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Responder
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          setReplyingToId(null);
                          setReplyContent("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
