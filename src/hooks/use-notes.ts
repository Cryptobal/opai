"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteEntityType, MentionPayload } from "@/types/notes";

interface UseNotesOptions {
  entityType: NoteEntityType;
  entityId: string;
}

interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  fetchNotes: () => Promise<void>;
  createNote: (content: string, mentionPayload: MentionPayload) => Promise<boolean>;
  createReply: (parentId: string, content: string, mentionPayload: MentionPayload) => Promise<boolean>;
  updateNote: (id: string, content: string, mentionPayload: MentionPayload) => Promise<boolean>;
  deleteNote: (id: string) => Promise<boolean>;
  markSeen: (noteId: string) => void;
  resolveRootNoteId: (noteId: string) => string | null;
}

export function useNotes({ entityType, entityId }: UseNotesOptions): UseNotesReturn {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/crm/notes?entityType=${entityType}&entityId=${entityId}`
      );
      const data = await res.json();
      if (data.success) setNotes(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback(
    async (content: string, mentionPayload: MentionPayload): Promise<boolean> => {
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          content: content.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      await fetchNotes();
      return true;
    },
    [entityType, entityId, fetchNotes]
  );

  const createReply = useCallback(
    async (
      parentId: string,
      content: string,
      mentionPayload: MentionPayload
    ): Promise<boolean> => {
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          parentId,
          content: content.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al responder");
      await fetchNotes();
      return true;
    },
    [entityType, entityId, fetchNotes]
  );

  const updateNote = useCallback(
    async (
      id: string,
      content: string,
      mentionPayload: MentionPayload
    ): Promise<boolean> => {
      const res = await fetch(`/api/crm/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          mentions: mentionPayload.mentions,
          mentionMeta: mentionPayload.mentionMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al actualizar");
      await fetchNotes();
      return true;
    },
    [fetchNotes]
  );

  const deleteNote = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await fetch(`/api/crm/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Error al eliminar");
      }
      await fetchNotes();
      return true;
    },
    [fetchNotes]
  );

  const markSeen = useCallback((noteId: string) => {
    if (!noteId || seenIdsRef.current.has(noteId)) return;
    seenIdsRef.current.add(noteId);
    fetch("/api/crm/notes/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds: [noteId], read: true }),
    })
      .then(() => {
        window.dispatchEvent(
          new CustomEvent("opai-note-seen", { detail: { noteId } })
        );
      })
      .catch(() => {
        // silent
      });
  }, []);

  const resolveRootNoteId = useCallback(
    (noteId: string): string | null => {
      for (const note of notes) {
        if (note.id === noteId) return note.id;
        if (note.replies.some((r) => r.id === noteId)) return note.id;
      }
      return null;
    },
    [notes]
  );

  return {
    notes,
    loading,
    fetchNotes,
    createNote,
    createReply,
    updateNote,
    deleteNote,
    markSeen,
    resolveRootNoteId,
  };
}
