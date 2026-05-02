"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type Pusher from "pusher-js";
import type { ChatMessageData, SendMessagePayload } from "@/lib/chat-types";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";

interface ChatThreadPanelProps {
  channelId: string;
  threadRootId: string;
  pusher: Pusher | null;
  onClose: () => void;
  currentUserId?: string;
}

/**
 * Slack-style thread side panel.
 * Shows the root message and all thread replies.
 */
export function ChatThreadPanel({
  channelId,
  threadRootId,
  pusher,
  onClose,
  currentUserId,
}: ChatThreadPanelProps) {
  const [rootMessage, setRootMessage] = useState<ChatMessageData | null>(null);
  const [replies, setReplies] = useState<ChatMessageData[]>([]);
  const [mentionDisplayMap, setMentionDisplayMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch thread messages
  const fetchThread = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch the root message by ID and thread replies in parallel
      const [rootRes, repliesRes] = await Promise.all([
        fetch(`/api/chat/channels/${channelId}/messages/${threadRootId}`),
        fetch(`/api/chat/channels/${channelId}/messages?threadRootId=${threadRootId}&limit=100&direction=newer`),
      ]);

      if (rootRes.ok) {
        const rootJson = await rootRes.json();
        if (rootJson.success && rootJson.data) {
          setRootMessage(rootJson.data);
        }
      }

      if (repliesRes.ok) {
        const repliesJson = await repliesRes.json();
        if (repliesJson.success) {
          setReplies(repliesJson.data);
          setMentionDisplayMap(repliesJson.meta?.mentionDisplayMap ?? {});
        }
      }
    } catch (err) {
      console.error("Error fetching thread:", err);
    } finally {
      setLoading(false);
    }
  }, [channelId, threadRootId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // Listen for thread replies via Pusher
  useEffect(() => {
    if (!pusher) return;

    const channelName = `presence-chat-${channelId}`;
    const channel = pusher.channel(channelName);
    if (!channel) return;

    const handler = (data: { threadRootId: string; message: ChatMessageData }) => {
      if (data.threadRootId === threadRootId) {
        setReplies((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "auto" });
        }, 100);
      }
    };

    channel.bind("thread-reply", handler);
    return () => {
      channel.unbind("thread-reply", handler);
    };
  }, [pusher, channelId, threadRootId]);

  // Auto-scroll to bottom when replies load
  useEffect(() => {
    if (!loading && replies.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [loading, replies.length]);

  const handleSend = useCallback(
    async (payload: SendMessagePayload) => {
      setSending(true);
      try {
        const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            threadRootId,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setReplies((prev) => {
              if (prev.some((m) => m.id === json.data.id)) return prev;
              return [...prev, json.data];
            });
            setTimeout(() => {
              bottomRef.current?.scrollIntoView({ behavior: "auto" });
            }, 100);
          }
        }
      } catch (err) {
        console.error("Error sending thread reply:", err);
      } finally {
        setSending(false);
      }
    },
    [channelId, threadRootId]
  );

  return (
    <div className="flex flex-col h-full border-l border-[rgba(255,255,255,0.06)] bg-[#0a0e17]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220] shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 sm:hidden text-[rgba(255,255,255,0.88)] hover:bg-[rgba(255,255,255,0.06)]"
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="h-4 w-4 text-status-info-fg shrink-0" />
        <h3 className="text-sm font-semibold flex-1 text-[rgba(255,255,255,0.88)]">Hilo</h3>
        <span className="text-xs text-[rgba(255,255,255,0.28)]">
          {replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 hidden sm:flex text-[rgba(255,255,255,0.88)] hover:bg-[rgba(255,255,255,0.06)]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[rgba(255,255,255,0.28)]" />
          </div>
        ) : (
          <>
            {/* Root message */}
            {rootMessage && (
              <div className="mb-3 pb-3 border-b border-[rgba(255,255,255,0.06)]">
                <ChatMessage
                  message={rootMessage}
                  mentionDisplayMap={mentionDisplayMap}
                  isOwn={rootMessage.senderType === "ADMIN"}
                  onReply={() => {}}
                  currentUserId={currentUserId}
                />
              </div>
            )}

            {/* Replies */}
            {replies.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                mentionDisplayMap={mentionDisplayMap}
                isOwn={msg.senderType === "ADMIN"}
                onReply={() => {}}
                currentUserId={currentUserId}
              />
            ))}

            {replies.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <p className="text-xs text-[rgba(255,255,255,0.28)]">Sin respuestas aún</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.18)]">
                  Escribe la primera respuesta abajo
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[rgba(255,255,255,0.06)] px-2 py-2">
        <ChatInput
          onSend={handleSend}
          channelId={channelId}
          pusher={pusher}
        />
      </div>
    </div>
  );
}
