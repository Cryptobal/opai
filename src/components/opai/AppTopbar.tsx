'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AppTopbarProps {
  children?: ReactNode;
  className?: string;
}

/**
 * AppTopbar - Barra superior de la aplicación
 * 
 * Topbar sticky de 64px que muestra acciones contextuales específicas de cada página.
 * Ahora es flexible y acepta cualquier contenido como children.
 * 
 * @example
 * ```tsx
 * <AppTopbar>
 *   <TemplatesDropdown />
 *   <NotificationBell />
 * </AppTopbar>
 * ```
 */
export function AppTopbar({ children, className }: AppTopbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="flex h-16 items-center justify-end gap-4 px-6">
        {children}
      </div>
    </header>
  );
}
