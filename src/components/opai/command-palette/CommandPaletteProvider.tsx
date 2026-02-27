'use client';

import { type ReactNode, useCallback, useEffect } from 'react';
import { CommandPaletteContext, useCommandPaletteState } from './use-command-palette';

interface CommandPaletteProviderProps {
  children: ReactNode;
}

/**
 * Provider que habilita el Command Palette global.
 *
 * Debe envolver la app (o al menos las rutas que usan el palette).
 * Maneja el atajo Cmd+K / Ctrl+K para abrir/cerrar.
 */
export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const { value, isOpen, setIsOpen } = useCommandPaletteState();

  // Cmd+K / Ctrl+K global shortcut
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => !prev);
        return;
      }

      // Close on Escape
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    },
    [isOpen, setIsOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Lock body scroll when open (iOS-safe: position:fixed prevents scroll-through)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}
