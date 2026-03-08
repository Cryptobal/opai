'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  seen?: boolean;
  link?: string | null;
  createdAt: string;
  sourceModule?: string;
  source_module?: string;
  sourceModuleLabel?: string;
  source_module_label?: string;
  sourceRecordName?: string | null;
  source_record_name?: string | null;
  isSystem?: boolean;
  is_system?: boolean;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  markAsRead: (ids: string[]) => Promise<void>;
  markAsUnread: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  markAllSeen: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async (limit = 50) => {
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data || []);
        setUnreadCount(data.meta?.unreadCount ?? 0);
        setHasMore(data.meta?.hasMore ?? false);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchUnreadCountOnly = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=1');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && typeof data.meta?.unreadCount === 'number') {
        setUnreadCount(data.meta.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Initial full fetch + lightweight count-only polling every 30s
  useEffect(() => {
    fetchNotifications();
    pollIntervalRef.current = setInterval(fetchUnreadCountOnly, 30_000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchNotifications, fetchUnreadCountOnly]);

  const markAsRead = useCallback(async (ids: string[]) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true, seen: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));

    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch {
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAsUnread = useCallback(async (ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: false } : n))
    );
    setUnreadCount((prev) => prev + ids.length);

    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read: false }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch {
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, seen: true })));
    setUnreadCount(0);

    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch {
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllSeen = useCallback(async () => {
    const unseenIds = notifications.filter((n) => !n.seen && !n.read).map((n) => n.id);
    if (unseenIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unseenIds, markSeen: true }),
      });
    } catch {
      await fetchNotifications();
    }
  }, [notifications, fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    const wasUnread = notifications.find((n) => n.id === id && !n.read);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      await fetchNotifications();
    }
  }, [notifications, fetchNotifications]);

  const deleteAll = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      });
    } catch {
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const loadMore = useCallback(async () => {
    if (!hasMore || notifications.length === 0) return;
    const lastId = notifications[notifications.length - 1].id;
    try {
      const res = await fetch(`/api/notifications?limit=50&cursor=${lastId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => [...prev, ...(data.data || [])]);
        setHasMore(data.meta?.hasMore ?? false);
      }
    } catch {
      // silent
    }
  }, [hasMore, notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        hasMore,
        markAsRead,
        markAsUnread,
        markAllRead,
        markAllSeen,
        deleteNotification,
        deleteAll,
        refetch: fetchNotifications,
        loadMore,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
