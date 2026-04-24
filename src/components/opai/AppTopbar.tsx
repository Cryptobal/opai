'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsIOS } from '@/hooks/usePlatform';

export interface AppTopbarProps {
  children?: ReactNode;
  className?: string;
}

/**
 * AppTopbar - Barra superior de la aplicación
 *
 * Topbar sticky de 64px que muestra acciones contextuales específicas de cada página.
 * En iOS aplica Liquid Glass; en el resto mantiene el estilo sólido clásico.
 */
export function AppTopbar({ children, className }: AppTopbarProps) {
  const isIOS = useIsIOS();
  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-16",
        isIOS
          ? "opai-liquid-glass-bar-top"
          : "border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="flex h-16 items-center justify-end gap-4 px-6">
        {children}
      </div>
    </header>
  );
}
