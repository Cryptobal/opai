'use client';

import { cloneElement, isValidElement, ReactElement, ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { ThemeLogo } from './ThemeLogo';
import { TopbarActions } from './TopbarActions';
import { AiHelpChatWidget } from './AiHelpChatWidget';
import { BottomNav } from './BottomNav';

export interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  className?: string;
}

/**
 * AppShell - Layout principal
 *
 * Desktop: sidebar izquierdo + content (full-width)
 * Mobile: topbar con hamburger + content + bottom nav
 *
 * Design tokens:
 * - Content padding: px-4 → sm:px-6 → lg:px-8 → xl:px-10 → 2xl:px-12
 * - Sidebar: w-60 (expanded) / w-[72px] (collapsed)
 * - Transition: duration-200 ease-out
 */
export function AppShell({ sidebar, children, userName, userEmail, userRole, className }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Auto-close mobile search overlay on route change (safety net)
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setIsMobileSearchOpen(false);
    }
  }, [pathname]);

  const handleMobileRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    // Refresh suave para mantener la experiencia móvil fluida.
    router.refresh();
    window.setTimeout(() => {
      setIsRefreshing(false);
    }, 700);
  };

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
          showCloseButton?: boolean;
          onClose?: () => void;
        }>,
        {
          className: cn(
            (sidebar as ReactElement<{ className?: string }>).props.className,
            'z-50 transition-transform duration-300 ease-out',
            'top-0 h-[100dvh] max-h-[100dvh]',
            isMobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          ),
          onNavigate: () => setIsMobileOpen(false),
          onToggleSidebar: () => setIsSidebarOpen((o) => !o),
          isSidebarOpen: true,
          showCloseButton: isMobileOpen,
          onClose: () => setIsMobileOpen(false),
        }
      )
    : sidebar;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ── Mobile topbar ── */}
      {sidebar && (
        <header
          className="sticky top-0 z-30 flex min-h-12 items-center justify-between border-b border-border bg-card/95 py-2 backdrop-blur lg:hidden"
          style={{
            paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
            paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
          }}
        >
          <Link href="/hub" className="flex shrink-0 items-center gap-2 hover:opacity-80">
            <ThemeLogo width={28} height={28} className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">OPAI</span>
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <ThemeToggle compact />
            <NotificationBell compact />
            <button
              type="button"
              className="inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsMobileSearchOpen(true)}
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleMobileRefresh}
              disabled={isRefreshing}
              aria-label="Actualizar pantalla"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
      )}

      {/* ── Desktop sidebar (siempre visible: expandida o colapsada con iconos) ── */}
      {sidebar && (
        <div className="hidden lg:block">
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
          {/* Sidebar móvil: de arriba a abajo (anclado arriba), X arriba */}
          <div
            className="fixed left-0 top-0 z-50 w-[320px] max-w-[88vw] h-[100dvh] max-h-[100dvh] shadow-xl flex flex-col pointer-events-none"
            style={{ pointerEvents: isMobileOpen ? 'auto' : 'none' }}
          >
            {mobileSidebar}
          </div>
        </div>
      )}

      {/* ── Mobile search overlay ── */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <GlobalSearch compact className="flex-1" onNavigate={() => setIsMobileSearchOpen(false)} />
            <button
              type="button"
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setIsMobileSearchOpen(false)}
              aria-label="Cerrar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div
        className={cn(
          'transition-[padding] duration-200 ease-out min-w-0 overflow-x-hidden',
          isSidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]',
          className
        )}
      >
        {/* Topbar actions desktop — búsqueda + campana + avatar */}
        <div className="hidden lg:flex sticky top-0 z-20 items-center justify-end gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-2 shrink-0">
          <TopbarActions userName={userName} userEmail={userEmail} userRole={userRole} />
        </div>
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <div className="px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pb-24 lg:pb-6 animate-in-page min-w-0 overflow-x-hidden" role="region">
            {children}
          </div>
        </main>
      </div>

      {/* ── Bottom Nav (mobile) ── */}
      <BottomNav userRole={userRole} />

      {/* ── Command Palette ── */}
      <CommandPalette userRole={userRole} />

      {/* ── Asistente IA ── */}
      <AiHelpChatWidget />
    </div>
  );
}
