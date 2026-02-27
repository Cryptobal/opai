/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionPopover } from "./MentionPopover";
import type { MentionTarget, MentionOption, MentionPayload } from "@/types/notes";
import type { UseMentionsReturn } from "@/hooks/use-mentions";

interface NoteComposerProps {
  mentions: UseMentionsReturn;
  target: MentionTarget;
  placeholder?: string;
  onSubmit: (content: string, mentionPayload: MentionPayload) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  submitLabel?: string;
  showHint?: boolean;
  compact?: boolean;
}

export function NoteComposer({
  mentions,
  target,
  placeholder = "Escribe una nota... usa @ para mencionar",
  onSubmit,
  onCancel,
  autoFocus = false,
  submitLabel,
  showHint = false,
  compact = false,
}: NoteComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    mentions.handleTextChange(newValue, target, textareaRef);
  };

  const handleSubmit = async () => {
    if (!value.trim() || sending) return;
    setSending(true);
    try {
      const mentionPayload = mentions.buildMentionPayload(value);
      await onSubmit(value, mentionPayload);
      setValue("");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const handled = mentions.handleKeyDown(
      e,
      value,
      textareaRef,
      setValue
    );
    if (handled) return;

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  };

  const handleMentionSelect = (option: MentionOption) => {
    mentions.insertMention(option, value, textareaRef, setValue);
  };

  if (compact) {
    return (
      <div className="relative">
        {mentions.mentionTarget === target && (
          <MentionPopover
            visible={mentions.showMentions}
            options={mentions.groupedOptions}
            selectedIdx={mentions.selectedMentionIdx}
            onSelect={handleMentionSelect}
          />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-h-[62px] resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={2}
          autoFocus={autoFocus}
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleSubmit}
            disabled={sending || !value.trim()}
          >
            {sending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {submitLabel || "Enviar"}
          </Button>
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={onCancel}
            >
              Cancelar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        {mentions.mentionTarget === target && (
          <MentionPopover
            visible={mentions.showMentions}
            options={mentions.groupedOptions}
            selectedIdx={mentions.selectedMentionIdx}
            onSelect={handleMentionSelect}
          />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-h-[72px] resize-none rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
          rows={2}
          autoFocus={autoFocus}
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1.5 bottom-1.5 h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={handleSubmit}
          disabled={sending || !value.trim()}
          aria-label="Enviar nota"
          title="Enviar nota"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {showHint && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border px-1 py-0.5 text-[9px]">
            Ctrl
          </kbd>
          +
          <kbd className="rounded border border-border px-1 py-0.5 text-[9px]">
            Enter
          </kbd>{" "}
          para enviar
        </p>
      )}
    </div>
  );
}
