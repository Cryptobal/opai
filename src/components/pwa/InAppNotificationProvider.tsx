'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Listens for push notifications forwarded from the Service Worker
 * and shows in-app toast notifications using sonner.
 *
 * Does NOT show toasts when:
 * - The page is hidden (the OS push banner handles it)
 * - The user is actively viewing the chat channel that the message is for
 */
export function InAppNotificationProvider({
  activeChannelId,
  children,
}: {
  activeChannelId?: string | null;
  children: React.ReactNode;
}) {
  const activeChannelRef = useRef(activeChannelId);
  activeChannelRef.current = activeChannelId;

  // Track recent messages per channel for grouping
  const recentMessages = useRef(new Map<string, { count: number; timer: ReturnType<typeof setTimeout> }>());

  const handlePushMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type !== 'PUSH_RECEIVED') return;

    // Don't show toast if page is hidden
    if (document.hidden) return;

    const { title, body, data, tag } = event.data;
    const channelId = data?.channelId;
    const type = data?.type;

    // Don't show toast for the channel the user is currently viewing
    // Check both the prop-based ref and the global window variable set by ChatFloatingProvider
    const globalActiveChannel = typeof window !== 'undefined'
      ? (window as any).__activeChatChannelId
      : null;
    if (channelId && (channelId === activeChannelRef.current || channelId === globalActiveChannel)) return;

    // Group rapid messages from the same channel
    if (tag && type === 'chat_message') {
      const existing = recentMessages.current.get(tag);
      if (existing) {
        existing.count += 1;
        clearTimeout(existing.timer);

        // Update with grouped message
        const channelName = data?.channelName || 'Chat';
        const groupedBody = `${existing.count} mensajes nuevos en ${channelName}`;

        existing.timer = setTimeout(() => {
          recentMessages.current.delete(tag);
        }, 5000);

        toast(title, {
          id: tag, // replace existing toast for same channel
          description: groupedBody,
          duration: 6000,
          action: data?.url ? {
            label: 'Ver',
            onClick: () => {
              window.location.href = data.url;
            },
          } : undefined,
        });
        return;
      }

      // First message in this channel within grouping window
      const timer = setTimeout(() => {
        recentMessages.current.delete(tag);
      }, 5000);
      recentMessages.current.set(tag, { count: 1, timer });
    }

    // Show toast
    const isChat = type === 'chat_message';
    toast(title, {
      id: tag || undefined,
      description: body,
      duration: 6000,
      action: data?.url ? {
        label: isChat ? 'Abrir chat' : 'Ver',
        onClick: () => {
          window.location.href = data.url;
        },
      } : undefined,
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', handlePushMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handlePushMessage);
      // Clear all timers
      recentMessages.current.forEach((entry) => clearTimeout(entry.timer));
      recentMessages.current.clear();
    };
  }, [handlePushMessage]);

  return <>{children}</>;
}
