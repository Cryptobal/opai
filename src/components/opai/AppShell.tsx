'use client';

import { cloneElement, isValidElement, ReactElement, ReactNode, useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';

export interface AppShellProps {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  userName?: string;
  className?: string;
}

/**
 * AppShell - Layout principal
 *
 * Desktop: sidebar izquierdo + content
 * Mobile: topbar con hamburger + content + bottom nav
 */
export function AppShell({ sidebar, topbar, children, userName, className }: AppShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isMobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobileOpen]);

  const mobileSidebar = isValidElement(sidebar)
    ? cloneElement(
        sidebar as ReactElement<{
          className?: string;
          onNavigate?: () => void;
          onToggleSidebar?: () => void;
          isSidebarOpen?: boolean;
        }>,
        {
          className: cn(
            (sidebar as ReactElement<{ className?: string }>).props.className,
            'z-50 transition-transform duration-300 ease-out',
            isMobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          ),
          onNavigate: () => setIsMobileOpen(false),
          onToggleSidebar: () => setIsSidebarOpen((o) => !o),
          isSidebarOpen,
        }
      )
    : sidebar;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ── Mobile topbar ── */}
      {sidebar && (
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
          <span className="text-sm font-semibold tracking-tight">OPAI</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
      )}

      {/* ── Desktop sidebar ── */}
      {sidebar && (
        <div className={cn('hidden lg:block', !isSidebarOpen && 'lg:hidden')}>
          {isValidElement(sidebar)
            ? cloneElement(
                sidebar as ReactElement<{
                  onToggleSidebar?: () => void;
                  isSidebarOpen?: boolean;
                }>,
                {
                  onToggleSidebar: () => setIsSidebarOpen((o) => !o),
                  isSidebarOpen,
                }
              )
            : sidebar}
        </div>
      )}

      {/* ── Desktop reopen button ── */}
      {sidebar && !isSidebarOpen && (
        <button
          type="button"
          className="fixed bottom-6 left-6 z-40 hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Abrir navegación"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* ── Mobile drawer overlay ── */}
      {sidebar && (
        <div className={cn('lg:hidden', isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none')}>
          <div
            className={cn(
              'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
              isMobileOpen ? 'opacity-100' : 'opacity-0'
            )}
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Close button */}
          <button
            type="button"
            className={cn(
              "fixed right-4 top-3 z-[60] h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground shadow-lg transition-opacity duration-300",
              isMobileOpen ? "inline-flex opacity-100" : "hidden opacity-0"
            )}
            onClick={() => setIsMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="fixed left-0 top-0 z-50 h-screen w-60 max-w-[85vw]">
            {mobileSidebar}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className={cn(isSidebarOpen ? 'lg:pl-60' : 'lg:pl-0', className)}>
        {topbar}
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-20 lg:pb-6 animate-in-page">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <BottomNav />

      {/* ── Command Palette ── */}
      <CommandPalette />
    </div>
  );
}
