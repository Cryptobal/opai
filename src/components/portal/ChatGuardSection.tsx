"use client";

import React, { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { Send, Paperclip, Loader2, ArrowLeft, X, Image as ImageIcon, File as FileIcon } from "lucide-react";
import type { GuardSession } from "@/lib/guard-portal";
import type { ChatMessageData, ChatAttachment } from "@/lib/chat-types";
import Pusher from "pusher-js";

interface ChatGuardSectionProps {
  session: GuardSession;
}

export function ChatGuardSection({ session }: ChatGuardSectionProps) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pusherRef = useRef<Pusher | null>(null);

  const headers = {
    "x-guardia-id": session.guardiaId,
    "x-tenant-id": session.tenantId,
    "x-guardia-name": `${session.firstName} ${session.lastName}`,
    "Content-Type": "application/json",
  };

  // Load channel
  useEffect(() => {
    fetch("/api/portal/guardia/chat/channels", { headers })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.length > 0) {
          setChannelId(res.data[0].id);
          setChannelName(res.data[0].name);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages
  useEffect(() => {
    if (!channelId) return;
    setIsLoading(true);
    fetch(`/api/portal/guardia/chat/channels/${channelId}/messages?limit=50`, { headers })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setMessages(res.data.reverse());
          setHasMore(res.meta?.hasMore ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to Pusher
  useEffect(() => {
    if (!channelId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/portal/guardia/chat/pusher/auth",
      auth: {
        headers: {
          "x-guardia-id": session.guardiaId,
          "x-tenant-id": session.tenantId,
          "x-guardia-name": `${session.firstName} ${session.lastName}`,
        },
      },
    });

    const channelName = `presence-chat-${channelId}`;
    const channel = pusher.subscribe(channelName);

    channel.bind("new-message", (data: ChatMessageData) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      // Auto-scroll to bottom
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });

    channel.bind("message-deleted", (data: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.id));
    });

    channel.bind("message-edited", (data: { id: string; content: string; editedAt: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, content: data.content, isEdited: true } : m))
      );
    });

    pusherRef.current = pusher;

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
      pusherRef.current = null;
    };
  }, [channelId, session.guardiaId, session.tenantId, session.firstName, session.lastName]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (messages.length > 0 && !loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark as read
  useEffect(() => {
    if (!channelId || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    fetch(`/api/portal/guardia/chat/channels/${channelId}/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ lastReadMessageId: lastMsg.id }),
    }).catch(() => {});
  }, [channelId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!channelId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    const oldestId = messages[0]?.id;
    const url = `/api/portal/guardia/chat/channels/${channelId}/messages?limit=50${oldestId ? `&cursor=${oldestId}` : ""}`;
    try {
      const res = await fetch(url, { headers }).then((r) => r.json());
      if (res.success) {
        setMessages((prev) => [...res.data.reverse(), ...prev]);
        setHasMore(res.meta?.hasMore ?? false);
      }
    } catch {}
    setLoadingMore(false);
  }, [channelId, hasMore, loadingMore, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const maxSize = 10 * 1024 * 1024;
    const valid = files.filter((f) => f.size <= maxSize).slice(0, 5 - pendingFiles.length);
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingFiles.length]);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const uploadFiles = async (files: File[]): Promise<ChatAttachment[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch("/api/portal/guardia/chat/upload", {
      method: "POST",
      headers: {
        "x-guardia-id": session.guardiaId,
        "x-tenant-id": session.tenantId,
        "x-guardia-name": `${session.firstName} ${session.lastName}`,
      },
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  };

  const handleSend = async () => {
    if (!channelId || (!inputText.trim() && pendingFiles.length === 0) || isSending) return;
    const content = inputText.trim();
    setIsSending(true);
    setInputText("");
    setReplyTo(null);

    try {
      let attachments: ChatAttachment[] | undefined;
      if (pendingFiles.length > 0) {
        setIsUploading(true);
        attachments = await uploadFiles(pendingFiles);
        setIsUploading(false);
        setPendingFiles([]);
      }

      const body: Record<string, unknown> = { content: content || "[Archivo adjunto]" };
      if (replyTo) body.replyToId = replyTo.id;
      if (attachments) body.attachments = attachments;

      const res = await fetch(`/api/portal/guardia/chat/channels/${channelId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (res.success) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {}
    setIsSending(false);
    setIsUploading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 50 && hasMore && !loadingMore) {
      loadMore();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <p className="text-zinc-400 text-sm">No hay chat disponible para tu instalación actual.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center">
          <span className="text-blue-400 text-xs font-bold">#</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{channelName}</h3>
          <p className="text-[10px] text-zinc-500">Chat de instalación</p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderType === "GUARD" && msg.senderId === session.guardiaId}
            onReply={() => setReplyTo(msg)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border-t border-zinc-800">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-400">Respondiendo a {replyTo.senderName}</p>
            <p className="text-xs text-zinc-400 truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File previews */}
      {pendingFiles.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 overflow-x-auto">
          {pendingFiles.map((file, idx) => (
            <div key={idx} className="relative shrink-0 group">
              {file.type.startsWith("image/") ? (
                <div className="h-12 w-12 rounded-lg overflow-hidden border border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                  <FileIcon className="h-4 w-4 text-zinc-400" />
                  <span className="text-[8px] text-zinc-500 truncate max-w-[40px]">
                    {file.name.split(".").pop()?.toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removePendingFile(idx)}
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendingFiles.length >= 5}
            className="h-[38px] w-[38px] shrink-0 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Adjuntar archivo"
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
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 resize-none bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-28"
            style={{ minHeight: "38px" }}
          />
          <button
            onClick={handleSend}
            disabled={(!inputText.trim() && pendingFiles.length === 0) || isSending}
            className="h-[38px] w-[38px] rounded-lg bg-blue-600 flex items-center justify-center text-white disabled:opacity-40 hover:bg-blue-500 transition-colors"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {isUploading && (
          <p className="text-[10px] text-zinc-500 mt-1 ml-11">Subiendo archivos...</p>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ──

function MessageBubble({
  message,
  isOwn,
  onReply,
}: {
  message: ChatMessageData;
  isOwn: boolean;
  onReply: () => void;
}) {
  if (message.senderType === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-zinc-500 italic">{message.content}</span>
      </div>
    );
  }

  const senderColor =
    message.senderType === "ADMIN"
      ? "text-blue-400"
      : message.senderType === "GUARD"
        ? "text-emerald-400"
        : "text-amber-400";

  const bubbleClass = isOwn
    ? "bg-blue-600/20 border border-blue-500/20"
    : "bg-zinc-800/60 border border-zinc-700/30";

  const time = new Date(message.createdAt).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && (
        <span className={`text-[10px] font-medium mb-0.5 ml-1 ${senderColor}`}>
          {message.senderName}
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 ${bubbleClass} group relative`}
        onDoubleClick={onReply}
      >
        {/* Reply quote */}
        {message.replyTo && (
          <div className="border-l-2 border-zinc-600 pl-2 mb-1.5">
            <p className="text-[10px] text-zinc-500 font-medium">{message.replyTo.senderName}</p>
            <p className="text-[10px] text-zinc-500 truncate max-w-[200px]">{message.replyTo.content}</p>
          </div>
        )}
        <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{message.content}</p>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((att, i) => (
              <a
                key={i}
                href={att.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
              >
                {att.fileType?.startsWith("image/") ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileIcon className="h-3 w-3" />
                )}
                {att.fileName}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-1 mt-1">
          {message.isEdited && <span className="text-[9px] text-zinc-600">editado</span>}
          <span className="text-[9px] text-zinc-600">{time}</span>
        </div>
      </div>
    </div>
  );
}
