'use client';

import { useBadgeSync } from '@/hooks/useBadgeSync';

/**
 * Single source of truth for the PWA app badge.
 * Delegates to useBadgeSync, which polls /api/badge/count and applies
 * setAppBadge/clearAppBadge based on the real per-user unread total.
 * Should be mounted in every layout that represents a PWA entry point.
 */
export function BadgeClear() {
  useBadgeSync();
  return null;
}
