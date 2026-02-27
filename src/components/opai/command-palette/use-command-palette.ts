'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { CommandItem, RecentItem } from './types';

const RECENTS_KEY = 'opai-command-palette-recents';
const MAX_RECENTS = 8;

// ── Context ──

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Comandos adicionales registrados dinámicamente */
  externalCommands: CommandItem[];
  registerCommands: (commands: CommandItem[]) => void;
  unregisterCommands: (ids: string[]) => void;
  /** Historial de recientes */
  addRecent: (item: Omit<RecentItem, 'timestamp'>) => void;
  getRecents: () => RecentItem[];
  clearRecents: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/**
 * Hook para interactuar con el Command Palette desde cualquier componente.
 *
 * @example
 * ```tsx
 * const { open, registerCommands } = useCommandPalette();
 *
 * useEffect(() => {
 *   registerCommands([{
 *     id: 'custom-action',
 *     label: 'Mi acción',
 *     category: 'action',
 *     icon: Zap,
 *     action: () => doSomething(),
 *   }]);
 *   return () => unregisterCommands(['custom-action']);
 * }, []);
 * ```
 */
export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette debe usarse dentro de <CommandPaletteProvider>');
  }
  return ctx;
}

// ── localStorage helpers ──

function readRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(items));
  } catch {
    // silently fail
  }
}

// ── Hook for provider state (used by CommandPaletteProvider) ──

export function useCommandPaletteState() {
  const [isOpen, setIsOpen] = useState(false);
  const [externalCommands, setExternalCommands] = useState<CommandItem[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const registerCommands = useCallback((commands: CommandItem[]) => {
    setExternalCommands((prev) => {
      const ids = new Set(commands.map((c) => c.id));
      return [...prev.filter((c) => !ids.has(c.id)), ...commands];
    });
  }, []);

  const unregisterCommands = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setExternalCommands((prev) => prev.filter((c) => !idSet.has(c.id)));
  }, []);

  const addRecent = useCallback((item: Omit<RecentItem, 'timestamp'>) => {
    const recents = readRecents();
    const entry: RecentItem = { ...item, timestamp: Date.now() };
    const filtered = recents.filter((r) => r.id !== item.id);
    const updated = [entry, ...filtered].slice(0, MAX_RECENTS);
    writeRecents(updated);
  }, []);

  const getRecents = useCallback(() => readRecents(), []);

  const clearRecents = useCallback(() => {
    writeRecents([]);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      externalCommands,
      registerCommands,
      unregisterCommands,
      addRecent,
      getRecents,
      clearRecents,
    }),
    [isOpen, open, close, toggle, externalCommands, registerCommands, unregisterCommands, addRecent, getRecents, clearRecents],
  );

  return { value, isOpen, setIsOpen };
}
