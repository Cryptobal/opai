'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type PlatformTheme = 'light' | 'dark';

interface PlatformThemeContextValue {
  theme: PlatformTheme;
  toggleTheme: () => void;
}

const PlatformThemeContext = createContext<PlatformThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

export function usePlatformTheme() {
  return useContext(PlatformThemeContext);
}

const STORAGE_KEY = 'opai-platform-theme';

/**
 * Manages theme for /platform/* pages independently from the tenant app.
 * Saves preference to localStorage under a separate key.
 * On mount, overrides the root <html> dark class. On unmount, restores it.
 */
export function PlatformThemeForcer({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<PlatformTheme>('light');
  const [mounted, setMounted] = useState(false);

  // On mount: apply platform theme
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PlatformTheme | null;
    const initial = saved ?? 'light';
    setTheme(initial);
    setMounted(true);

    // Apply immediately
    const root = document.documentElement;
    if (initial === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    return () => {
      // Restore the tenant app's dark mode when leaving platform
      root.classList.add('dark');
    };
  }, []);

  // Apply theme changes after mount
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <PlatformThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </PlatformThemeContext.Provider>
  );
}
