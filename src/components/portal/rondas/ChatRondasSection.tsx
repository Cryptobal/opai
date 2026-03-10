"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, ArrowLeft, X } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";
import type { ChatMessageData } from "@/lib/chat-types";
import { ChatSlackMessage } from "@/components/chat/ChatSlackMessage";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import Pusher from "pusher-js";

/* ── Grouping helpers ── */

function computeIsFirstInGroup(messages: { senderId: string; createdAt: string }[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.senderId !== curr.senderId) return true;
  return (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 5 * 60 * 1000;
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}`;
}

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
    "x-guardia-name": encodeURIComponent(session.nombre),
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
          "x-guardia-name": encodeURIComponent(session.nombre),
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
    <div className="flex flex-1 overflow-hidden flex-col bg-[#0a0a0f]">
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
            className="flex-1 overflow-y-auto py-3"
          >
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              </div>
            )}
            {messages.map((msg, idx) => {
              const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
              const currDateKey = getDateKey(msg.createdAt);
              const showDateDivider = currDateKey !== prevDateKey;
              const isFirst = computeIsFirstInGroup(messages, idx);

              return (
                <React.Fragment key={msg.id || idx}>
                  {showDateDivider && <ChatDateDivider label={formatDateLabel(msg.createdAt)} />}
                  <ChatSlackMessage message={msg} isFirstInGroup={isFirst}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {msg.attachments.map((att, i) => (
                          <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-[#2dd4bf] hover:text-teal-300">
                            {att.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </ChatSlackMessage>
                </React.Fragment>
              );
            })}
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
          <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-end gap-2 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] px-3 py-2">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none max-h-28"
                style={{ minHeight: "38px" }}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending}
                className="h-[38px] w-[38px] rounded-lg bg-[#2dd4bf] flex items-center justify-center text-zinc-900 disabled:opacity-40 hover:bg-teal-300 transition-colors shrink-0"
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
