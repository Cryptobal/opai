"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  SendHorizontal,
  Paperclip,
  Smile,
  X,
  File as FileIcon,
} from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import type { SendMessagePayload, ChatAttachment } from "@/lib/chat-types";

type FilePreview = {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface ChatInputPortalProps {
  onSend: (payload: SendMessagePayload) => Promise<void>;
  uploadEndpoint: string;
  uploadHeaders?: Record<string, string>;
  replyTo?: { id: string; senderName: string; content: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  enableEmoji?: boolean;
  enableFileUpload?: boolean;
}

/**
 * Lightweight chat input for portal screens.
 * Features: auto-resize textarea, emoji picker, file upload, reply banner.
 */
export function ChatInputPortal({
  onSend,
  uploadEndpoint,
  uploadHeaders,
  replyTo,
  onCancelReply,
  disabled,
  enableEmoji = true,
  enableFileUpload = true,
}: ChatInputPortalProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  const handleEmojiSelect = useCallback((emojiData: { emoji: string }) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? content.length;
      const end = ta.selectionEnd ?? content.length;
      const newContent = content.slice(0, start) + emojiData.emoji + content.slice(end);
      setContent(newContent);
      setTimeout(() => {
        const pos = start + emojiData.emoji.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
      }, 0);
    } else {
      setContent((prev) => prev + emojiData.emoji);
    }
    setShowEmojiPicker(false);
  }, [content]);

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length === 0) return;

      const remaining = MAX_FILES - files.length;
      const toAdd = selected.slice(0, remaining);

      const previews: FilePreview[] = toAdd
        .filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
        .map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          isImage: file.type.startsWith("image/"),
        }));

      setFiles((prev) => [...prev, ...previews]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files.length],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    if (isSending || isUploading) return;

    setIsSending(true);
    try {
      let attachments: ChatAttachment[] | undefined;
      if (files.length > 0) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          files.forEach((f) => formData.append("files", f.file));
          const res = await fetch(uploadEndpoint, {
            method: "POST",
            headers: uploadHeaders,
            body: formData,
          });
          if (!res.ok) {
            console.error("[ChatInputPortal] upload failed:", res.status);
            return;
          }
          const json = await res.json();
          if (!json.success) {
            console.error("[ChatInputPortal] upload error:", json.error);
            return;
          }
          attachments = json.data;
        } finally {
          setIsUploading(false);
        }
      }

      await onSend({
        content: trimmed,
        replyToId: replyTo?.id,
        attachments,
      });

      setContent("");
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      setFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      console.error("[ChatInputPortal] send error:", err);
    } finally {
      setIsSending(false);
    }
  }, [content, files, isSending, isUploading, replyTo, onSend, uploadEndpoint, uploadHeaders]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="shrink-0 px-3 py-2 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 min-w-0 border-l-2 border-blue-500 pl-2">
            <p className="text-xs font-medium text-blue-400">
              Respondiendo a {replyTo.senderName}
            </p>
            <p className="text-xs text-zinc-500 truncate">{replyTo.content}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Cancelar respuesta"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto">
          {files.map((fp, idx) => (
            <div key={idx} className="relative shrink-0 group">
              {fp.isImage && fp.previewUrl ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden border border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fp.previewUrl}
                    alt={fp.file.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                  <FileIcon className="h-5 w-5 text-zinc-400" />
                  <span className="text-[9px] text-zinc-500 truncate max-w-[56px] mt-0.5">
                    {fp.file.name.split(".").pop()?.toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label={`Eliminar ${fp.file.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400" />
          Subiendo archivos...
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] transition-colors px-3 py-1">
        {/* File upload button */}
        {enableFileUpload && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_FILES || disabled}
              className="flex items-center justify-center h-8 w-8 text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.88)] transition-colors shrink-0 mb-0.5 disabled:opacity-40"
              aria-label="Adjuntar archivo"
              title={files.length >= MAX_FILES ? `Maximo ${MAX_FILES} archivos` : "Adjuntar archivo"}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            />
          </>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none py-1.5 max-h-[120px] disabled:opacity-50"
        />

        {/* Emoji picker */}
        {enableEmoji && (
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled}
              className="flex items-center justify-center h-8 w-8 text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.88)] transition-colors shrink-0 mb-0.5"
              aria-label="Emoji"
              title="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 z-50">
                <EmojiPicker
                  theme={Theme.DARK}
                  onEmojiClick={handleEmojiSelect}
                  width={320}
                  height={400}
                  searchPlaceholder="Buscar emoji..."
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || isSending || (!content.trim() && files.length === 0)}
          className="flex items-center justify-center h-8 w-8 text-[#2dd4bf] hover:text-[#5eead4] transition-colors shrink-0 mb-0.5 disabled:opacity-30 disabled:hover:text-[#2dd4bf]"
          aria-label="Enviar mensaje"
          title="Enviar mensaje"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
