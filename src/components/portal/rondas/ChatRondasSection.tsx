"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, ArrowLeft, X, Image as ImageIcon, File as FileIcon } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";
import type { ChatMessageData } from "@/lib/chat-types";
import Pusher from "pusher-js";

interface ChatRondasSectionProps {
  session: RondasSession;
  onBack: () => void;
}

export function ChatRondasSection({ session, onBack }: ChatRondasSectionProps) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const headers: Record<string, string> = {
    "x-guardia-id": session.guardiaId,
    "x-tenant-id": session.tenantId,
    "x-guardia-name": session.nombre,
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
          "x-guardia-name": session.nombre,
        },
      },
    });

    const presenceChannelName = `presence-chat-${channelId}`;
    const channel = pusher.subscribe(presenceChannelName);

    channel.bind("new-message", (data: ChatMessageData) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });

    channel.bind("message-deleted", (data: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.id));
    });

    channel.bind("message-edited", (data: { id: string; content: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, content: data.content, isEdited: true } : m))
      );
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(presenceChannelName);
      pusher.disconnect();
    };
  }, [channelId, session.guardiaId, session.tenantId, session.nombre]);

  // Scroll to bottom on load
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

  const handleSend = async () => {
    if (!channelId || !inputText.trim() || isSending) return;
    const content = inputText.trim();
    setIsSending(true);
    setInputText("");
    setReplyTo(null);

    try {
      const body: Record<string, unknown> = { content };
      if (replyTo) body.replyToId = replyTo.id;

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

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100 truncate">
            {channelName || "Chat"}
          </h2>
          <p className="text-[10px] text-zinc-500">Chat de instalación</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : !channelId ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-zinc-400 text-sm text-center">No hay chat disponible.</p>
        </div>
      ) : (
        <>
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
              <RondasMessageBubble
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
                <p className="text-[10px] text-teal-400">Respondiendo a {replyTo.senderName}</p>
                <p className="text-xs text-zinc-400 truncate">{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/80 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 resize-none bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500 max-h-28"
                style={{ minHeight: "38px" }}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending}
                className="h-[38px] w-[38px] rounded-lg bg-teal-600 flex items-center justify-center text-white disabled:opacity-40 hover:bg-teal-500 transition-colors"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Message Bubble ──

function RondasMessageBubble({
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
        ? "text-teal-400"
        : "text-amber-400";

  const bubbleClass = isOwn
    ? "bg-teal-600/15 border border-teal-500/20"
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
        className={`max-w-[85%] rounded-xl px-3 py-2 ${bubbleClass}`}
        onDoubleClick={onReply}
      >
        {message.replyTo && (
          <div className="border-l-2 border-zinc-600 pl-2 mb-1.5">
            <p className="text-[10px] text-zinc-500 font-medium">{message.replyTo.senderName}</p>
            <p className="text-[10px] text-zinc-500 truncate max-w-[200px]">{message.replyTo.content}</p>
          </div>
        )}
        <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{message.content}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((att, i) => (
              <a
                key={i}
                href={att.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-teal-400 hover:text-teal-300"
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
