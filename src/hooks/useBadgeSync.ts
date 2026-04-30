'use client';
import { useEffect, useRef } from 'react';

interface BadgeNavigator {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Single source of truth for the app badge count.
 * Polls /api/badge/count every 60s, on visibility change, and on SW push messages.
 * Skips redundant updates by comparing against the last applied total.
 */
export function useBadgeSync() {
  const lastTotalRef = useRef<number>(-1);

  useEffect(() => {
    const sync = async () => {
      try {
        const res = await fetch('/api/badge/count', { cache: 'no-store' });
        if (!res.ok) return;
        const { total } = (await res.json()) as { chat: number; bell: number; total: number };
        if (total === lastTotalRef.current) return;
        lastTotalRef.current = total;
        if (typeof navigator === 'undefined') return;
        const nav = navigator as Navigator & BadgeNavigator;
        if (total > 0 && nav.setAppBadge) {
          await nav.setAppBadge(total).catch(() => {});
        } else if (nav.clearAppBadge) {
          await nav.clearAppBadge().catch(() => {});
        }
      } catch {
        // network errors are silent — next interval will retry
      }
    };

    sync();
    const interval = setInterval(sync, 60_000);
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onMessage = (e: MessageEvent) => {
      const t = (e.data as { type?: string } | null)?.type;
      if (t === 'PUSH_RECEIVED' || t === 'BADGE_SYNC') sync();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);
}
