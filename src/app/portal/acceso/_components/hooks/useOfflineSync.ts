"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const QUEUE_KEY = "ac_offline_sync_queue";
const SYNC_ENDPOINT = "/api/access-control/sync";

export type SyncStatus = "online" | "syncing" | "offline";

interface QueueItem {
  id: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  addToQueue: (payload: Record<string, unknown>) => void;
  syncQueue: () => Promise<void>;
  status: SyncStatus;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable
  }
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [status, setStatus] = useState<SyncStatus>("online");
  const isSyncing = useRef(false);

  // Initialize state on mount
  useEffect(() => {
    setIsOnline(navigator.onLine);
    setQueue(readQueue());
    setStatus(navigator.onLine ? "online" : "offline");
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatus("online");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncQueue = useCallback(async () => {
    if (isSyncing.current) return;

    const currentQueue = readQueue();
    if (currentQueue.length === 0) return;
    if (!navigator.onLine) return;

    isSyncing.current = true;
    setStatus("syncing");

    const failedItems: QueueItem[] = [];

    for (const item of currentQueue) {
      try {
        const response = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!response.ok) {
          failedItems.push(item);
        }
      } catch {
        failedItems.push(item);
      }
    }

    writeQueue(failedItems);
    setQueue(failedItems);
    isSyncing.current = false;
    setStatus(navigator.onLine ? "online" : "offline");
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue();
    }
  }, [isOnline, queue.length, syncQueue]);

  const addToQueue = useCallback(
    (payload: Record<string, unknown>) => {
      const item: QueueItem = {
        id: generateId(),
        timestamp: Date.now(),
        payload,
      };
      const updated = [...readQueue(), item];
      writeQueue(updated);
      setQueue(updated);

      // Try to sync immediately if online
      if (navigator.onLine) {
        syncQueue();
      }
    },
    [syncQueue]
  );

  return {
    isOnline,
    pendingCount: queue.length,
    addToQueue,
    syncQueue,
    status,
  };
}
