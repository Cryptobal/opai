'use client';

import { useEffect } from 'react';

/**
 * Forces light mode while platform admin pages are mounted.
 * Removes 'dark' class from <html> on mount, restores it on unmount.
 */
export function PlatformThemeForcer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');

    // Force light mode
    root.classList.remove('dark');

    return () => {
      // Restore dark mode when leaving platform pages
      if (wasDark) {
        root.classList.add('dark');
      }
    };
  }, []);

  return <>{children}</>;
}
