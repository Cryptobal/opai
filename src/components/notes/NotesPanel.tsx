/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { NotesSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useNotes } from "@/hooks/use-notes";
import { useMentions } from "@/hooks/use-mentions";
import { NoteComposer } from "./NoteComposer";
import { NoteThread } from "./NoteThread";
import type { NoteEntityType, MentionPayload } from "@/types/notes";

export interface NotesPanelProps {
  entityType: NoteEntityType;
  entityId: string;
  currentUserId: string;
}

export function NotesPanel({
  entityType,
  entityId,
  currentUserId,
}: NotesPanelProps) {
  const searchParams = useSearchParams();
  const {
    notes,
    loading,
    createNote,
    createReply,
    updateNote,
    deleteNote,
    markSeen,
    resolveRootNoteId,
  } = useNotes({ entityType, entityId });

  const mentions = useMentions({ currentUserId });

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string;
  }>({ open: false, id: "" });

  // IntersectionObserver — mark notes as seen
  useEffect(() => {
    if (notes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const rootNoteId = (entry.target as HTMLElement).dataset.rootNoteId;
          if (rootNoteId) markSeen(rootNoteId);
        }
      },
      { threshold: 0.45 }
    );
    const elements = document.querySelectorAll<HTMLElement>("[data-note-id]");
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [notes, markSeen]);

  // Deep-link scroll + highlight from URL params
  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (!noteId || notes.length === 0) return;

    const replyTo = searchParams.get("replyTo");
    const focusReply = searchParams.get("focusReply") === "1";
    const rootNoteId = replyTo || resolveRootNoteId(noteId) || noteId;

    if (focusReply) {
      setReplyingToId(rootNoteId);
    }

    setHighlightedNoteId(noteId);
    setTimeout(() => setHighlightedNoteId(null), 4500);

    markSeen(rootNoteId);
    requestAnimationFrame(() => {
      const target =
        document.getElementById(`note-${noteId}`) ||
        document.getElementById(`note-${rootNoteId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [markSeen, notes, resolveRootNoteId, searchParams]);

  // Handlers
  const handleCreateNote = useCallback(
    async (content: string, mentionPayload: MentionPayload) => {
      try {
        await createNote(content, mentionPayload);
        toast.success("Nota agregada");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "No se pudo crear la nota";
        toast.error(msg);
        throw err;
      }
    },
    [createNote]
  );

  const handleCreateReply = useCallback(
    async (content: string, mentionPayload: MentionPayload) => {
      if (!replyingToId) return;
      try {
        await createReply(replyingToId, content, mentionPayload);
        setReplyingToId(null);
        toast.success("Respuesta enviada");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "No se pudo responder";
        toast.error(msg);
        throw err;
      }
    },
    [createReply, replyingToId]
  );

  const handleUpdate = useCallback(
    async (id: string, content: string, mentionPayload: MentionPayload) => {
      try {
        await updateNote(id, content, mentionPayload);
        toast.success("Nota actualizada");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "No se pudo actualizar";
        toast.error(msg);
        throw err;
      }
    },
    [updateNote]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setDeleteConfirm({ open: true, id });
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    try {
      await deleteNote(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Nota eliminada");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo eliminar";
      toast.error(msg);
    }
  }, [deleteNote, deleteConfirm.id]);

  return (
    <div className="space-y-3">
      {/* New note input */}
      <NoteComposer
        mentions={mentions}
        target="new"
        onSubmit={handleCreateNote}
        showHint
      />

      {/* Notes list */}
      {loading ? (
        <NotesSkeleton />
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <MessageSquareText className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Sin notas aún</p>
        </div>
      ) : (
        <div className="space-y-0">
          {notes.map((note, idx) => (
            <NoteThread
              key={note.id}
              note={note}
              isLast={idx === notes.length - 1}
              highlightedNoteId={highlightedNoteId}
              currentUserId={currentUserId}
              mentions={mentions}
              replyingToId={replyingToId}
              onStartReply={setReplyingToId}
              onCancelReply={() => setReplyingToId(null)}
              onSubmitReply={handleCreateReply}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              defaultExpanded={
                searchParams.get("focusReply") === "1" &&
                (searchParams.get("replyTo") === note.id ||
                  resolveRootNoteId(searchParams.get("noteId") || "") ===
                    note.id)
              }
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) =>
          setDeleteConfirm({ ...deleteConfirm, open: v })
        }
        title="Eliminar nota"
        description="Esta nota será eliminada permanentemente."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
