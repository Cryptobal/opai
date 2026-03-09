'use client';

import { useEffect } from 'react';

/**
 * Clears the PWA app badge on mount (when the app is opened/focused).
 * Should be mounted in every layout that represents a PWA entry point.
 */
export function BadgeClear() {
  useEffect(() => {
    if ('clearAppBadge' in navigator) {
      (navigator as any).clearAppBadge().catch(() => {});
    }

    // Also clear when the page becomes visible (e.g. switching back to the app)
    function handleVisibilityChange() {
      if (!document.hidden && 'clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return null;
}
