"use client";

/**
 * SupervisorChat — Adapts ChatClienteSection for Admin/Supervisor.
 *
 * The supervisor is an Admin (senderType: "ADMIN") using NextAuth session.
 * Uses the same chat APIs as the rest of the app.
 * Channel fetching uses admin's installation assignments for filtering.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import Pusher from "pusher-js";
import type { ChatMessageData } from "@/lib/chat-types";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorSession } from "@/lib/portal-supervisor";
import { ChatSlackMessage } from "@/components/chat/ChatSlackMessage";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";

// ── Grouping helpers ──

function computeIsFirstInGroup(
  messages: { senderId: string; createdAt: string }[],
  index: number,
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.senderId !== curr.senderId) return true;
  return (
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() >
    5 * 60 * 1000
  );
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diff = Math.floor(
    (today.getTime() - msgDate.getTime()) / 86400000,
  );
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}`;
}

// ── Types ──

interface ChannelInfo {
  id: string;
  name: string;
  installationId: string | null;
  channelType: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

interface Props {
  session: SupervisorSession;
}

export function SupervisorChat({ session }: Props) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ChannelInfo | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pusherRef = useRef<Pusher | null>(null);
  const channelSubRef = useRef<ReturnType<Pusher["subscribe"]> | null>(null);

  const senderName = session.name;
  const headers: Record<string, string> = { "x-sender-type": "ADMIN" };

  // Load channels
  useEffect(() => {
    setLoadingChannels(true);
    const installationIds = session.installations.map((i) => i.id);
    Promise.all([
      fetch("/api/chat/channels", { headers }).then((r) => r.json()),
    ])
      .then(([res]) => {
        const all: ChannelInfo[] = res.data ?? [];
        // Filter to channels related to supervisor's installations or group/direct
        const filtered = all.filter(
          (ch) =>
            ch.channelType === "DIRECT" ||
            ch.channelType === "GROUP" ||
            (ch.installationId && installationIds.includes(ch.installationId))
        );
        setChannels(filtered);
      })
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false));
  }, [session]);

  // Load messages for selected channel
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, { headers });
      const json = await res.json();
      setMessages(json.data ?? []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      // noop
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Pusher subscription
  useEffect(() => {
    if (!selectedChannel) return;
    loadMessages(selectedChannel.id);

    if (!pusherRef.current) {
      pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: "/api/chat/pusher/auth",
      });
    }
    channelSubRef.current?.unbind_all();
    const sub = pusherRef.current.subscribe(`private-chat-${selectedChannel.id}`);
    sub.bind("new-message", (msg: ChatMessageData) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    channelSubRef.current = sub;

    return () => {
      sub.unbind_all();
      pusherRef.current?.unsubscribe(`private-chat-${selectedChannel.id}`);
    };
  }, [selectedChannel, loadMessages]);

  async function handleSend() {
    if (!text.trim() || !selectedChannel || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      await fetch(`/api/chat/channels/${selectedChannel.id}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ content, senderName }),
      });
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }

  // Channel list view
  if (!selectedChannel) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 pb-24">
        <h2 className="text-lg font-semibold">Chat</h2>
        {loadingChannels ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-zinc-600" size={24} />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title="Sin canales de chat"
            description="No tienes canales de chat asignados."
            compact
          />
        ) : (
          <div className="flex flex-col gap-1">
            {channels.map((ch) => {
              const isDm = ch.channelType === "DIRECT";
              return (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChannel(ch)}
                  className="flex items-center gap-3 h-14 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-left w-full"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    {isDm ? (
                      <MessageSquare size={16} className="text-blue-400" />
                    ) : (
                      <span className="text-sm font-bold text-blue-400">#</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {!isDm && <span className="text-zinc-500 mr-0.5">#</span>}
                      {ch.name}
                    </p>
                    {ch.lastMessagePreview && (
                      <p className="text-xs text-zinc-500 truncate">{ch.lastMessagePreview}</p>
                    )}
                  </div>
                  {ch.unreadCount > 0 && (
                    <span className="flex-shrink-0 bg-[#2dd4bf] text-zinc-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {ch.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Conversation view
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
        <button
          onClick={() => setSelectedChannel(null)}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
        >
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-medium truncate">{selectedChannel.name}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loadingMessages ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-zinc-600" size={24} />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-zinc-600 py-8">Sin mensajes aún</p>
        ) : (
          messages.map((msg, idx) => {
            const prevDateKey =
              idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
            const currDateKey = getDateKey(msg.createdAt);
            const showDateDivider = currDateKey !== prevDateKey;
            const isFirst = computeIsFirstInGroup(messages, idx);

            return (
              <React.Fragment key={msg.id || idx}>
                {showDateDivider && (
                  <ChatDateDivider label={formatDateLabel(msg.createdAt)} />
                )}
                <ChatSlackMessage message={msg} isFirstInGroup={isFirst} />
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220] flex-shrink-0">
        <div className="flex-1 flex items-center bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] transition-colors">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#2dd4bf] text-zinc-900 hover:brightness-110 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
