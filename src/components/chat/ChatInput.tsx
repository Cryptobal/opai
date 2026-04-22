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
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import type Pusher from "pusher-js";
import type { PresenceChannel } from "pusher-js";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { cn } from "@/lib/utils";
import type { SendMessagePayload, ChatAttachment, PusherTypingEvent } from "@/lib/chat-types";

type MentionUser = { id: string; name: string; email: string };

type GlobalSearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation" | "guardia" | "document" | "pauta_mensual" | "channel";
  title: string;
  subtitle: string;
  href: string;
};

const ENTITY_TYPE_ICONS: Record<GlobalSearchResult["type"], string> = {
  lead: "\uD83C\uDFAF",
  account: "\uD83C\uDFE2",
  contact: "\uD83D\uDC64",
  deal: "\uD83D\uDCBC",
  quote: "\uD83D\uDCCB",
  installation: "\uD83D\uDCCD",
  guardia: "\uD83D\uDEE1\uFE0F",
  document: "\uD83D\uDCC4",
  pauta_mensual: "\uD83D\uDCCA",
  channel: "\uD83D\uDCAC",
};

interface ChatInputProps {
  onSend: (payload: SendMessagePayload) => Promise<void>;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  } | null;
  onCancelReply?: () => void;
  channelId?: string;
  pusher?: Pusher | null;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type FilePreview = {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

/**
 * Message input component with:
 * - Auto-resizing textarea (min 1 row, max 5 rows)
 * - Enter to send, Shift+Enter for newline
 * - File upload with preview thumbnails
 * - Reply context banner
 * - Typing indicator trigger
 */
export function ChatInput({
  onSend,
  replyTo,
  onCancelReply,
  channelId,
  pusher,
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const mentionFetchRef = useRef<AbortController | null>(null);

  // #hashtag entity search state
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);
  const [hashtagResults, setHashtagResults] = useState<GlobalSearchResult[]>([]);
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [hashtagIndex, setHashtagIndex] = useState(0);
  const [hashtagStartPos, setHashtagStartPos] = useState(0);
  const hashtagFetchRef = useRef<AbortController | null>(null);
  const hashtagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 5 * 24; // approx 5 lines at 24px line height
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  // Focus textarea when reply is set
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  // Insert emoji at cursor position
  const handleEmojiSelect = useCallback((emojiData: { emoji: string }) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emojiData.emoji + content.slice(end);
      setContent(newContent);
      setTimeout(() => {
        const pos = start + emojiData.emoji.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }, 0);
    } else {
      setContent(prev => prev + emojiData.emoji);
    }
    setShowEmojiPicker(false);
  }, [content]);

  // Trigger typing indicator
  const triggerTyping = useCallback(() => {
    if (!pusher || !channelId) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;

    try {
      const channelName = `presence-chat-${channelId}`;
      const channel = pusher.channel(channelName) as PresenceChannel | undefined;
      if (channel) {
        channel.trigger("client-typing", {
          userId: "current-user",
          userName: "Yo",
          userType: "ADMIN",
        } satisfies PusherTypingEvent);
      }
    } catch {
      // Silently fail
    }
  }, [pusher, channelId]);

  // Detect @mention and #hashtag triggers
  const detectMention = useCallback(
    (value: string, cursorPos: number) => {
      const textBefore = value.slice(0, cursorPos);

      // Try to detect # first (entity search)
      const hashIndex = textBefore.lastIndexOf("#");
      if (hashIndex !== -1) {
        const hashPrecededByWhitespace = hashIndex === 0 || /\s/.test(textBefore[hashIndex - 1]);
        if (hashPrecededByWhitespace) {
          const hQuery = textBefore.slice(hashIndex + 1);
          // No spaces allowed in hashtag query
          if (!hQuery.includes(" ")) {
            setHashtagQuery(hQuery);
            setHashtagStartPos(hashIndex);
            setHashtagIndex(0);
            // Close @mention when #hashtag is active
            setMentionQuery(null);
            return;
          }
        }
      }

      // Clear hashtag if no valid # found
      setHashtagQuery(null);

      // Detect @mention
      const atIndex = textBefore.lastIndexOf("@");

      if (atIndex === -1) {
        setMentionQuery(null);
        return;
      }

      // Check if @ is at start or preceded by whitespace
      if (atIndex > 0 && !/\s/.test(textBefore[atIndex - 1])) {
        setMentionQuery(null);
        return;
      }

      const query = textBefore.slice(atIndex + 1);
      // No spaces allowed in mention query
      if (query.includes(" ") && !query.startsWith("todos")) {
        setMentionQuery(null);
        return;
      }

      setMentionQuery(query);
      setMentionStartPos(atIndex);
      setMentionIndex(0);
    },
    []
  );

  // Fetch mention users when query changes
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionUsers([]);
      return;
    }

    mentionFetchRef.current?.abort();
    const controller = new AbortController();
    mentionFetchRef.current = controller;

    const fetchUsers = async () => {
      try {
        const params = new URLSearchParams();
        if (mentionQuery) params.set("search", mentionQuery);
        if (channelId) params.set("channelId", channelId);

        const res = await fetch(`/api/chat/mentions/users?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) {
          setMentionUsers(json.data);
        }
      } catch {
        // Ignore abort errors
      }
    };

    fetchUsers();
    return () => controller.abort();
  }, [mentionQuery, channelId]);

  // Fetch hashtag entity results when query changes (debounced 300ms, min 1 char)
  useEffect(() => {
    if (hashtagQuery === null) {
      setHashtagResults([]);
      setHashtagLoading(false);
      return;
    }

    if (hashtagQuery.length < 1) {
      setHashtagResults([]);
      setHashtagLoading(false);
      return;
    }

    setHashtagLoading(true);

    // Clear previous debounce
    if (hashtagDebounceRef.current) {
      clearTimeout(hashtagDebounceRef.current);
    }

    hashtagDebounceRef.current = setTimeout(() => {
      hashtagFetchRef.current?.abort();
      const controller = new AbortController();
      hashtagFetchRef.current = controller;

      const fetchResults = async () => {
        try {
          const res = await fetch(`/api/search/global?q=${encodeURIComponent(hashtagQuery)}`, {
            signal: controller.signal,
          });
          if (!res.ok) return;
          const json = await res.json();
          if (json.success) {
            setHashtagResults(json.data);
          }
        } catch {
          // Ignore abort errors
        } finally {
          setHashtagLoading(false);
        }
      };

      fetchResults();
    }, 300);

    return () => {
      if (hashtagDebounceRef.current) {
        clearTimeout(hashtagDebounceRef.current);
      }
      hashtagFetchRef.current?.abort();
    };
  }, [hashtagQuery]);

  // Insert entity token from # dropdown
  const insertHashtagEntity = useCallback(
    (result: GlobalSearchResult) => {
      const before = content.slice(0, hashtagStartPos);
      // Skip past the '#' character + the query typed so far
      const after = content.slice(hashtagStartPos + 1 + (hashtagQuery?.length ?? 0));
      const token = `<#${result.type}:${result.id}:${result.title}>`;
      const newContent = before + token + " " + after;
      setContent(newContent);
      setHashtagQuery(null);
      setHashtagResults([]);

      setTimeout(() => {
        const pos = before.length + token.length + 1;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [content, hashtagStartPos, hashtagQuery]
  );

  const insertMention = useCallback(
    (userId: string, name: string) => {
      const before = content.slice(0, mentionStartPos);
      const after = content.slice(
        textareaRef.current?.selectionStart ?? content.length
      );
      const mentionToken = userId === "todos" ? "<@todos>" : `<@${userId}>`;
      const newContent = before + mentionToken + " " + after;
      setContent(newContent);
      setMentionQuery(null);

      // Set cursor position after mention
      setTimeout(() => {
        const pos = before.length + mentionToken.length + 1;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [content, mentionStartPos]
  );

  const handleContentChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);
      triggerTyping();
      detectMention(value, e.target.selectionStart ?? value.length);
    },
    [triggerTyping, detectMention]
  );

  // File handling
  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length === 0) return;

      const remainingSlots = MAX_FILES - files.length;
      const filesToAdd = selectedFiles.slice(0, remainingSlots);

      const newPreviews: FilePreview[] = filesToAdd
        .filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
        .map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
          isImage: file.type.startsWith("image/"),
        }));

      setFiles((prev) => [...prev, ...newPreviews]);

      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files.length]
  );

  const addFilesFromList = useCallback(
    (fileList: File[]) => {
      if (fileList.length === 0) return;
      const remainingSlots = MAX_FILES - files.length;
      const newPreviews: FilePreview[] = fileList
        .slice(0, remainingSlots)
        .filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
        .map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          isImage: file.type.startsWith("image/"),
        }));
      if (newPreviews.length > 0) setFiles((prev) => [...prev, ...newPreviews]);
    },
    [files.length]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFilesFromList(pastedFiles);
      }
    },
    [addFilesFromList]
  );

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFilesFromList(droppedFiles);
    },
    [addFilesFromList]
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && files.length === 0) return;
    if (isSending || isUploading) return;

    setIsSending(true);

    try {
      // Upload files to server before sending message
      let attachments: ChatAttachment[] | undefined;
      if (files.length > 0) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          files.forEach((f) => formData.append("files", f.file));
          const uploadRes = await fetch("/api/chat/upload", {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) {
            console.error("[ChatInput] upload failed:", uploadRes.status);
            return;
          }
          const uploadJson = await uploadRes.json();
          if (!uploadJson.success) {
            console.error("[ChatInput] upload error:", uploadJson.error);
            return;
          }
          attachments = uploadJson.data;
        } finally {
          setIsUploading(false);
        }
      }

      const payload: SendMessagePayload = {
        content: trimmedContent,
        replyToId: replyTo?.id,
        attachments,
      };

      await onSend(payload);

      // Reset state
      setContent("");
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      setFiles([]);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      console.error("[ChatInput] send error:", err);
    } finally {
      setIsSending(false);
    }
  }, [content, files, isSending, isUploading, replyTo, onSend]);

  // Build filterable mention options (users + @todos)
  const mentionOptions = mentionQuery !== null
    ? [
        // @todos always available
        ...(mentionQuery === "" || "todos".startsWith(mentionQuery.toLowerCase())
          ? [{ id: "todos", name: "@todos", email: "Notificar a todos" }]
          : []),
        ...mentionUsers.filter(u =>
          mentionQuery === "" ||
          u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(mentionQuery.toLowerCase())
        ),
      ]
    : [];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle hashtag entity navigation
      if (hashtagQuery !== null && hashtagResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHashtagIndex((prev) => Math.min(prev + 1, hashtagResults.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHashtagIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = hashtagResults[hashtagIndex];
          if (selected) {
            insertHashtagEntity(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setHashtagQuery(null);
          setHashtagResults([]);
          return;
        }
      }

      // Handle mention navigation
      if (mentionQuery !== null && mentionOptions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) => Math.min(prev + 1, mentionOptions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = mentionOptions[mentionIndex];
          if (selected) {
            insertMention(selected.id, selected.name);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
      }

      // Esc clears reply banner (or blurs input if no reply)
      if (e.key === "Escape") {
        if (replyTo && onCancelReply) {
          e.preventDefault();
          onCancelReply();
          return;
        }
      }

      // Cmd/Ctrl+Enter → always send (useful when shift+enter is configured as newline)
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, mentionQuery, mentionOptions, mentionIndex, insertMention, hashtagQuery, hashtagResults, hashtagIndex, insertHashtagEntity, replyTo, onCancelReply]
  );

  const isEmpty = content.trim().length === 0 && files.length === 0;

  return (
    <div
      className={cn(
        "px-4 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220] pb-[env(safe-area-inset-bottom)] relative",
        isDragging && "ring-2 ring-[#2dd4bf]/50 ring-inset"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
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
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-zinc-800">
          {files.map((filePreview, idx) => (
            <div
              key={idx}
              className="relative shrink-0 group"
            >
              {filePreview.isImage && filePreview.previewUrl ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden border border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={filePreview.previewUrl}
                    alt={filePreview.file.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                  <FileIcon className="h-5 w-5 text-zinc-400" />
                  <span className="text-[9px] text-zinc-500 truncate max-w-[56px] mt-0.5">
                    {filePreview.file.name.split(".").pop()?.toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                aria-label={`Eliminar ${filePreview.file.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-zinc-400 border-b border-zinc-800">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400" />
          Subiendo archivos...
        </div>
      )}

      {/* Input area: [paperclip] [textarea] [emoji] [send] */}
      <div className="flex items-end gap-1.5 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] transition-colors px-3 py-1">
        {/* File upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={files.length >= MAX_FILES}
          className="flex items-center justify-center h-8 w-8 text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.88)] transition-colors shrink-0 mb-0.5"
          aria-label="Adjuntar archivo"
          title={files.length >= MAX_FILES ? `Maximo ${MAX_FILES} archivos` : "Adjuntar archivo"}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        />

        {/* Textarea + mention/hashtag popup */}
        <div className="flex-1 min-w-0 relative">
          {/* #hashtag entity popup */}
          {hashtagQuery !== null && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl z-50">
              {hashtagQuery.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-zinc-500">
                  Escribe para buscar canales, clientes, guardias...
                </div>
              ) : hashtagLoading ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-500">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-blue-400" />
                  Buscando...
                </div>
              ) : hashtagResults.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-zinc-500">Sin resultados</div>
              ) : (
                hashtagResults.map((result, idx) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      idx === hashtagIndex
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-700/50"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertHashtagEntity(result);
                    }}
                    onMouseEnter={() => setHashtagIndex(idx)}
                  >
                    <span className="shrink-0 text-base leading-none">
                      {ENTITY_TYPE_ICONS[result.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-xs">{result.title}</p>
                      <p className="truncate text-[10px] text-zinc-500">{result.subtitle}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* @mention popup */}
          {mentionQuery !== null && mentionOptions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl z-50">
              {mentionOptions.map((user, idx) => (
                <button
                  key={user.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    idx === mentionIndex
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-300 hover:bg-zinc-700/50"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent textarea blur
                    insertMention(user.id, user.name);
                  }}
                  onMouseEnter={() => setMentionIndex(idx)}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                      user.id === "todos"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-teal-500/20 text-teal-400"
                    )}
                  >
                    {user.id === "todos" ? "@" : user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs">{user.name}</p>
                    <p className="truncate text-[10px] text-zinc-500">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.28)] focus:outline-none max-h-28 w-full leading-6"
            style={{ maxHeight: `${5 * 24}px` }}
            disabled={isSending || isUploading}
          />
        </div>

        {/* Emoji picker */}
        <div className="relative" ref={emojiPickerRef}>
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
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

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={isEmpty || isSending || isUploading}
          className="h-8 w-8 rounded-lg bg-[#2dd4bf] flex items-center justify-center text-zinc-900 disabled:opacity-40 hover:bg-teal-400 transition-colors shrink-0 mb-0.5"
          aria-label="Enviar mensaje"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
