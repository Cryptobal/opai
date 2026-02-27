"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteItem } from "./NoteItem";
import { NoteInput } from "./NoteInput";
import type { NoteData } from "./NotesProvider";

/* ─── Types ─── */

interface NoteThreadProps {
  note: NoteData;
  highlightedNoteId?: string | null;
}

/* ─── Component ─── */

export function NoteThread({ note, highlightedNoteId }: NoteThreadProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ noteId: string; authorName: string } | null>(null);

  const hasReplies = note.replies.length > 0;
  const hasManyReplies = note.replies.length > 3;

  // Show last 2 replies when collapsed, all when expanded
  const visibleReplies = hasManyReplies && !isExpanded
    ? note.replies.slice(-2)
    : note.replies;
  const hiddenCount = hasManyReplies && !isExpanded
    ? note.replies.length - visibleReplies.length
    : 0;

  const handleReply = (noteId: string, authorName: string) => {
    setReplyingTo({ noteId, authorName });
    setIsExpanded(true);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSent = () => {
    setReplyingTo(null);
  };

  return (
    <div className="space-y-0">
      {/* Root note */}
      <NoteItem
        note={note}
        isHighlighted={highlightedNoteId === note.id}
        onReply={handleReply}
        onToggleThread={hasReplies ? () => setIsExpanded((v) => !v) : undefined}
        isThreadExpanded={isExpanded}
      />

      {/* Replies thread */}
      {hasReplies && (isExpanded || !hasManyReplies) && (
        <div className="ml-8 mt-1.5 border-l-2 border-border/50 pl-3 space-y-1.5">
          {/* Expand/collapse when many replies */}
          {hasManyReplies && (
            <button
              type="button"
              className="mb-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsExpanded((v) => !v)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Ocultar respuestas ({note.replies.length})
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  {hiddenCount} respuestas más
                </>
              )}
            </button>
          )}

          {visibleReplies.map((reply) => (
            <NoteItem
              key={reply.id}
              note={reply}
              isReply
              isHighlighted={highlightedNoteId === reply.id}
              onReply={handleReply}
            />
          ))}
        </div>
      )}

      {/* Collapsed thread indicator (many replies, not expanded) */}
      {hasManyReplies && !isExpanded && (
        <div className="ml-8 mt-1.5 border-l-2 border-border/50 pl-3 space-y-1.5">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors",
            )}
            onClick={() => setIsExpanded(true)}
          >
            <ChevronDown className="h-3 w-3" />
            {hiddenCount} respuestas más
          </button>
          {visibleReplies.map((reply) => (
            <NoteItem
              key={reply.id}
              note={reply}
              isReply
              isHighlighted={highlightedNoteId === reply.id}
              onReply={handleReply}
            />
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyingTo && (
        <div className="ml-8 mt-1.5 pl-3">
          <NoteInput
            parentNoteId={note.id}
            replyToAuthor={replyingTo.authorName}
            onCancelReply={handleCancelReply}
            onSent={handleSent}
            compact
          />
        </div>
      )}
    </div>
  );
}
