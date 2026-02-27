"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { NoteItem } from "./NoteItem";
import { NoteComposer } from "./NoteComposer";
import type { Note, MentionPayload } from "@/types/notes";
import type { UseMentionsReturn } from "@/hooks/use-mentions";

interface NoteThreadProps {
  note: Note;
  isLast: boolean;
  highlightedNoteId: string | null;
  currentUserId: string;
  mentions: UseMentionsReturn;
  replyingToId: string | null;
  onStartReply: (rootId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (content: string, mentionPayload: MentionPayload) => Promise<void>;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string, mentionPayload: MentionPayload) => Promise<void>;
  defaultExpanded?: boolean;
}

export function NoteThread({
  note,
  isLast,
  highlightedNoteId,
  currentUserId,
  mentions,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onUpdate,
  defaultExpanded = false,
}: NoteThreadProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hasManyReplies = note.replies.length > 3;
  const visibleReplies =
    hasManyReplies && !isExpanded ? note.replies.slice(-2) : note.replies;
  const hiddenRepliesCount =
    hasManyReplies && !isExpanded ? note.replies.length - visibleReplies.length : 0;

  const isReplying = replyingToId === note.id;

  const handleReply = (rootId: string) => {
    onStartReply(rootId);
    if (hasManyReplies) setIsExpanded(true);
  };

  return (
    <div
      className={`group flex gap-3 py-3 ${!isLast ? "border-b border-border/50" : ""}`}
    >
      <div className="flex-1">
        <NoteItem
          note={note}
          rootId={note.id}
          isHighlighted={highlightedNoteId === note.id}
          currentUserId={currentUserId}
          mentions={mentions}
          onReply={handleReply}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />

        {note.replies.length > 0 && (
          <div className="ml-8 mt-2 border-l border-border/60 pl-3 space-y-2">
            {hasManyReplies && (
              <button
                type="button"
                className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {isExpanded
                  ? `Ocultar respuestas (${note.replies.length})`
                  : `${hiddenRepliesCount} respuestas más`}
              </button>
            )}
            {visibleReplies.map((reply) => (
              <NoteItem
                key={reply.id}
                note={reply}
                rootId={note.id}
                isReply
                isHighlighted={highlightedNoteId === reply.id}
                currentUserId={currentUserId}
                mentions={mentions}
                onReply={handleReply}
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}

        {isReplying && (
          <div className="ml-8 mt-2">
            <NoteComposer
              mentions={mentions}
              target="reply"
              placeholder="Escribe una respuesta..."
              submitLabel="Responder"
              onSubmit={onSubmitReply}
              onCancel={onCancelReply}
              autoFocus
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
