"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UnreadCountsResponse } from "@/lib/chat-types";

type UseChatUnreadCountsReturn = {
  total: number;
  channels: Record<string, number>;
  refresh: () => void;
  markChannelAsRead: (channelId: string) => void;
};

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook that polls /api/chat/unread-counts every 30 seconds.
 * Returns the total unread count and per-channel counts.
 */
export function useChatUnreadCounts(): UseChatUnreadCountsReturn {
  const [total, setTotal] = useState(0);
  const [channels, setChannels] = useState<Record<string, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-counts");
      if (!res.ok) return;

      const json: UnreadCountsResponse = await res.json();
      if (json.success) {
        setTotal(json.data.total);
        setChannels(json.data.channels);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    intervalRef.current = setInterval(fetchCounts, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCounts]);

  /** Optimistically set a channel's unread count to 0 */
  const markChannelAsRead = useCallback((channelId: string) => {
    setChannels((prev) => {
      const diff = prev[channelId] ?? 0;
      if (diff === 0) return prev;
      setTotal((t) => Math.max(0, t - diff));
      return { ...prev, [channelId]: 0 };
    });
  }, []);

  return { total, channels, refresh: fetchCounts, markChannelAsRead };
}
