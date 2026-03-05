"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import type { Channel, Members, PresenceChannel } from "pusher-js";
import type {
  ChatMessageData,
  PusherNewMessageEvent,
  PusherMessageEditedEvent,
  PusherMessageDeletedEvent,
  PusherReactionEvent,
  PusherTypingEvent,
  ChatSenderType,
} from "@/lib/chat-types";

export type PresenceMember = {
  id: string;
  name: string;
  type: ChatSenderType;
};

type UseChatChannelReturn = {
  messages: ChatMessageData[];
  members: PresenceMember[];
  typingUsers: { userId: string; userName: string }[];
  appendMessage: (msg: ChatMessageData) => void;
  editMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  addReaction: (messageId: string, emoji: string, sender: { id: string; name: string; type: ChatSenderType }) => void;
  removeReaction: (messageId: string, emoji: string, senderId: string) => void;
  clearMessages: () => void;
};

/**
 * Hook that subscribes to a Pusher presence channel and manages real-time events
 * for chat messages, reactions, member presence, and typing indicators.
 */
export function useChatChannel(
  channelId: string | null,
  pusher: Pusher | null
): UseChatChannelReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ userId: string; userName: string }[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<Channel | null>(null);

  // ---- Helpers ----

  const appendMessage = useCallback((msg: ChatMessageData) => {
    setMessages((prev) => {
      // Prevent duplicates (e.g., optimistic + real-time)
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const editMessage = useCallback((id: string, content: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, isEdited: true } : m))
    );
  }, []);

  const deleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addReaction = useCallback(
    (
      messageId: string,
      emoji: string,
      sender: { id: string; name: string; type: ChatSenderType }
    ) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...m.reactions];
          const existing = reactions.find((r) => r.emoji === emoji);
          if (existing) {
            if (existing.senders.some((s) => s.id === sender.id)) return m;
            return {
              ...m,
              reactions: reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, senders: [...r.senders, sender] }
                  : r
              ),
            };
          }
          return {
            ...m,
            reactions: [...reactions, { emoji, count: 1, senders: [sender] }],
          };
        })
      );
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const removeReaction = useCallback((messageId: string, emoji: string, senderId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions
          .map((r) => {
            if (r.emoji !== emoji) return r;
            const senders = r.senders.filter((s) => s.id !== senderId);
            return senders.length > 0 ? { ...r, count: senders.length, senders } : null;
          })
          .filter(Boolean) as typeof m.reactions;
        return { ...m, reactions };
      })
    );
  }, []);

  // ---- Typing ----

  const clearTypingUser = useCallback((userId: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    const timer = typingTimersRef.current.get(userId);
    if (timer) {
      clearTimeout(timer);
      typingTimersRef.current.delete(userId);
    }
  }, []);

  // ---- Subscribe / Unsubscribe ----

  useEffect(() => {
    if (!pusher || !channelId) return;

    const presenceChannelName = `presence-chat-${channelId}`;
    const channel = pusher.subscribe(presenceChannelName) as PresenceChannel;
    channelRef.current = channel;

    // Presence events
    channel.bind("pusher:subscription_succeeded", (membersData: Members) => {
      const memberList: PresenceMember[] = [];
      membersData.each((member: { id: string; info: { name: string; type: ChatSenderType } }) => {
        memberList.push({ id: member.id, name: member.info.name, type: member.info.type });
      });
      setMembers(memberList);
    });

    channel.bind("pusher:member_added", (member: { id: string; info: { name: string; type: ChatSenderType } }) => {
      setMembers((prev) => {
        if (prev.some((m) => m.id === member.id)) return prev;
        return [...prev, { id: member.id, name: member.info.name, type: member.info.type }];
      });
    });

    channel.bind("pusher:member_removed", (member: { id: string }) => {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      clearTypingUser(member.id);
    });

    // Chat events
    channel.bind("new-message", (data: PusherNewMessageEvent) => {
      const msg: ChatMessageData = {
        ...data,
        threadRootId: null,
        replyCount: 0,
        lastReplyAt: null,
        reactions: [],
        systemEventData: null,
        isEdited: false,
      };
      appendMessage(msg);
    });

    channel.bind("message-edited", (data: PusherMessageEditedEvent) => {
      editMessage(data.id, data.content);
    });

    channel.bind("message-deleted", (data: PusherMessageDeletedEvent) => {
      deleteMessage(data.id);
    });

    channel.bind("reaction-added", (data: PusherReactionEvent) => {
      addReaction(data.messageId, data.emoji, {
        id: data.senderId,
        name: data.senderName,
        type: data.senderType,
      });
    });

    channel.bind("messages-cleared", () => {
      clearMessages();
    });

    channel.bind("reaction-removed", (data: PusherReactionEvent) => {
      removeReaction(data.messageId, data.emoji, data.senderId);
    });

    channel.bind("client-typing", (data: PusherTypingEvent) => {
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userName: data.userName }];
      });
      // Clear typing after 3s
      const existing = typingTimersRef.current.get(data.userId);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        data.userId,
        setTimeout(() => clearTypingUser(data.userId), 3000)
      );
    });

    return () => {
      pusher.unsubscribe(presenceChannelName);
      channelRef.current = null;
      setMessages([]);
      setMembers([]);
      setTypingUsers([]);
      // Clear all typing timers
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
    };
  }, [pusher, channelId, appendMessage, editMessage, deleteMessage, addReaction, removeReaction, clearMessages, clearTypingUser]);

  return {
    messages,
    members,
    typingUsers,
    appendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    clearMessages,
  };
}
