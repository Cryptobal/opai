"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, PresenceChannel } from "pusher-js";
import type { PusherTypingEvent } from "@/lib/chat-types";

type UseChatTypingReturn = {
  typingUsers: { userId: string; userName: string }[];
  startTyping: () => void;
};

const TYPING_DEBOUNCE_MS = 2000;
const TYPING_EXPIRE_MS = 3000;

/**
 * Hook for managing typing indicators.
 * Triggers client-typing events with debounce and clears remote
 * typing users after a timeout.
 */
export function useChatTyping(
  channel: Channel | PresenceChannel | null,
  currentUserId?: string,
  currentUserName?: string
): UseChatTypingReturn {
  const [typingUsers, setTypingUsers] = useState<{ userId: string; userName: string }[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = useRef(0);

  // Clear a user from the typing list
  const clearTypingUser = useCallback((userId: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    const timer = typingTimersRef.current.get(userId);
    if (timer) {
      clearTimeout(timer);
      typingTimersRef.current.delete(userId);
    }
  }, []);

  // Listen for typing events from others
  useEffect(() => {
    if (!channel) return;

    const handler = (data: PusherTypingEvent) => {
      // Ignore own typing events
      if (data.userId === currentUserId) return;

      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userName: data.userName }];
      });

      // Reset or create expire timer
      const existing = typingTimersRef.current.get(data.userId);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        data.userId,
        setTimeout(() => clearTypingUser(data.userId), TYPING_EXPIRE_MS)
      );
    };

    channel.bind("client-typing", handler);

    return () => {
      channel.unbind("client-typing", handler);
      // Clear all timers
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
      setTypingUsers([]);
    };
  }, [channel, currentUserId, clearTypingUser]);

  // Trigger typing event with debounce
  const startTyping = useCallback(() => {
    if (!channel || !currentUserId || !currentUserName) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_DEBOUNCE_MS) return;
    lastTypingSentRef.current = now;

    try {
      (channel as PresenceChannel).trigger("client-typing", {
        userId: currentUserId,
        userName: currentUserName,
        userType: "ADMIN",
      } satisfies PusherTypingEvent);
    } catch {
      // Silently fail if trigger isn't available (e.g., not a presence channel)
    }
  }, [channel, currentUserId, currentUserName]);

  return { typingUsers, startTyping };
}
