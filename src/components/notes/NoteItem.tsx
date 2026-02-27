/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useRef, useState } from "react";
import {
  CornerDownRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MentionPopover } from "./MentionPopover";
import { getInitials, timeAgo } from "./note-helpers";
import type { Note, MentionOption, MentionPayload } from "@/types/notes";
import type { UseMentionsReturn } from "@/hooks/use-mentions";

interface NoteItemProps {
  note: Note;
  rootId: string;
  isReply?: boolean;
  isHighlighted?: boolean;
  currentUserId: string;
  mentions: UseMentionsReturn;
  onReply: (rootId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string, mentionPayload: MentionPayload) => Promise<void>;
}

function RenderContent({ content }: { content: string }) {
  const parts = content.split(/(@\w[\w\s]*?)(?=\s|$|@)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span key={i} className="text-primary font-medium">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function NoteItem({
  note,
  rootId,
  isReply = false,
  isHighlighted = false,
  currentUserId,
  mentions,
  onReply,
  onDelete,
  onUpdate,
}: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = note.createdBy === currentUserId && !isEditing;

  const startEdit = () => {
    setIsEditing(true);
    setEditContent(note.content);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditContent("");
  };

  const saveEdit = async () => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      const mentionPayload = mentions.buildMentionPayload(editContent);
      await onUpdate(note.id, editContent, mentionPayload);
      setIsEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditChange = (value: string) => {
    setEditContent(value);
    mentions.handleTextChange(value, "edit", editRef);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    const handled = mentions.handleKeyDown(e, editContent, editRef, setEditContent);
    if (handled) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const handleMentionSelect = (option: MentionOption) => {
    mentions.insertMention(option, editContent, editRef, setEditContent);
  };

  return (
    <div
      id={`note-${note.id}`}
      data-note-id={note.id}
      data-root-note-id={rootId}
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
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(note.createdAt)}
            </span>
            {note.updatedAt !== note.createdAt && (
              <span className="text-[10px] text-muted-foreground italic">
                (editada)
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1.5 relative">
              {mentions.mentionTarget === "edit" && (
                <MentionPopover
                  visible={mentions.showMentions}
                  options={mentions.groupedOptions}
                  selectedIdx={mentions.selectedMentionIdx}
                  onSelect={handleMentionSelect}
                />
              )}
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => handleEditChange(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full min-h-[60px] resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                autoFocus
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={saveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={cancelEdit}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap break-words">
                <RenderContent content={note.content} />
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                  onClick={() => onReply(rootId)}
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Más opciones"
                  title="Más opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(note.id)}
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
}
