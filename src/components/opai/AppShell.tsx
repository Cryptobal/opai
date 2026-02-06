'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AppShellProps {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * AppShell - Layout principal de la aplicación
 * 
 * Estructura de 3 zonas:
 * - Sidebar fijo (240px) a la izquierda
 * - Topbar sticky (64px) arriba
 * - Content area con scroll independiente
 * 
 * El sidebar se oculta en mobile (TODO: implementar drawer/toggle)
 * 
 * @example
 * ```tsx
 * <AppShell
 *   sidebar={<AppSidebar navItems={items} />}
 *   topbar={<AppTopbar userMenu={<UserMenu />} />}
 * >
 *   <PageContent />
 * </AppShell>
 * ```
 */
export function AppShell({ sidebar, topbar, children, className }: AppShellProps) {
  return (
    <div className="relative min-h-screen">
      {/* Sidebar */}
      {sidebar && (
        <div className="hidden lg:block">
          {sidebar}
        </div>
      )}

      {/* Main content area (offset por sidebar) */}
      <div className={cn("lg:pl-60", className)}>
        {/* Topbar (opcional) */}
        {topbar}

        {/* Page content */}
        <main className="flex-1">
          <div className="container mx-auto p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
