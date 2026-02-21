'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

/**
 * ThemeToggle — Botón para cambiar entre tema claro y oscuro.
 *
 * compact: versión más pequeña para mobile topbar.
 */
export function ThemeToggle({ compact, className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        compact ? "h-8 w-8" : "h-9 w-9",
        className
      )}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
    >
      {theme === 'dark' ? (
        <Sun className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]")} />
      ) : (
        <Moon className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]")} />
      )}
    </button>
  );
}
