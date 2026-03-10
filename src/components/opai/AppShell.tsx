'use client';

import { cloneElement, isValidElement, ReactElement, ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Menu, MessageCircle, Plus, Search, X, TrendingUp, Building2, Contact, Users, Ticket, Receipt, Shield, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { CommandPalette, CommandPaletteProvider } from './CommandPalette';
import { ThemeToggle } from './ThemeToggle';
import { ThemeLogo } from './ThemeLogo';
import { TopbarActions } from './TopbarActions';
import { QuickCreateModal, type QuickCreateType } from './QuickCreateModal';
import { AiHelpChatWidget } from './AiHelpChatWidget';
import { SimulationBanner } from '@/components/navbar/SimulationBanner';
import { RoleSwitcher } from '@/components/navbar/RoleSwitcher';
import { BottomNav } from './BottomNav';
import { useChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MOBILE_CREATE_ITEMS: { label: string; type: QuickCreateType; icon: typeof TrendingUp; navigateHref?: string }[] = [
  { label: "Nuevo Lead", type: "lead", icon: TrendingUp },
  { label: "Nueva Cuenta", type: "account", icon: Building2 },
  { label: "Nuevo Contacto", type: "contact", icon: Contact },
  { label: "Nuevo Negocio", type: "deal", icon: Users },
  { label: "Nuevo Ticket", type: "ticket", icon: Ticket },
  { label: "Nueva Rendición", type: null, icon: Receipt, navigateHref: "/finanzas/rendiciones/nueva" },
  { label: "Nueva Persona", type: null, icon: Shield, navigateHref: "/personas/guardias" },
  { label: "Nuevo Documento", type: null, icon: FileText, navigateHref: "/opai/documentos/nuevo" },
  { label: "Nueva Visita", type: null, icon: Activity, navigateHref: "/ops/supervision/nueva-visita" },
];

export interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  notificationUnreadCount?: number;
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
export function AppShell({
  sidebar,
  children,
  userName,
  userEmail,
  userRole,
  notificationUnreadCount = 0,
  className,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const chatCtx = useChatSidePanelContext();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [mobileCreateType, setMobileCreateType] = useState<QuickCreateType>(null);

  // Auto-close mobile search overlay on route change (safety net)
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setIsMobileSearchOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;
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
    <CommandPaletteProvider>
      <div className="relative min-h-screen overflow-x-hidden">
        {/* ── Mobile topbar (fixed como la barra inferior) ── */}
        {sidebar && (
          <header
            className="fixed top-0 left-0 right-0 z-30 flex min-h-12 items-center justify-between border-b border-border/60 bg-card/95 py-2 shadow-sm backdrop-blur lg:hidden"
            style={{
              paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
              paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
              paddingTop: 'env(safe-area-inset-top)',
            }}
          >
            <div className="flex shrink-0 items-center gap-2 min-w-0">
              <Link href="/hub" className="flex items-center gap-2 hover:opacity-80 shrink-0">
                <ThemeLogo width={28} height={28} className="h-7 w-7" />
                <span className="text-sm font-semibold tracking-tight">OPAI</span>
              </Link>
              <div className="shrink-0 flex items-center min-h-[44px] -my-1">
                <RoleSwitcher />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    aria-label="Crear nuevo"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {MOBILE_CREATE_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.label}
                        onClick={() => {
                          if (item.navigateHref) {
                            router.push(item.navigateHref);
                          } else if (item.type) {
                            setMobileCreateType(item.type);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <ThemeToggle compact />
              <button
                type="button"
                className="inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
                onClick={() => setIsMobileSearchOpen(true)}
                aria-label="Buscar"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="relative inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 sm:hidden"
                onClick={chatCtx.togglePanel}
                aria-label="Abrir chat"
              >
                <MessageCircle className="h-4 w-4" />
                {chatCtx.totalUnread > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card" />
                )}
              </button>
              <button
                type="button"
                className="relative inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
                onClick={() => setIsMobileOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
                {notificationUnreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                )}
              </button>
            </div>
          </header>
        )}

        {/* ── Desktop sidebar (solo iconos, colapsado permanente) ── */}
        {sidebar && (
          <div className="hidden lg:block">
            {isValidElement(sidebar)
              ? cloneElement(
                sidebar as ReactElement<{
                  onToggleSidebar?: () => void;
                  isSidebarOpen?: boolean;
                }>,
                {
                  isSidebarOpen: false,
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
              <GlobalSearch
                compact
                className="flex-1"
                onNavigate={() => setIsMobileSearchOpen(false)}
                onOpenChat={(channelId) => {
                  setIsMobileSearchOpen(false);
                  chatCtx.openPanel();
                  chatCtx.selectChannel(channelId);
                }}
              />
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
            'transition-[padding] duration-200 ease-out min-w-0 w-full',
            'pt-[calc(4rem+env(safe-area-inset-top,0px))] lg:pt-0', // espacio para topbar fija en mobile
            isSidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]',
            className
          )}
        >
          {/* Topbar actions desktop — búsqueda + tema + avatar */}
          <div className="hidden lg:flex sticky top-0 z-20 h-12 items-center gap-3 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 shrink-0">
            <TopbarActions userName={userName} userEmail={userEmail} userRole={userRole} />
          </div>
          {/* Simulation Banner — visible when simulating a different role */}
          <SimulationBanner />
          <main className="flex-1 min-w-0 w-full">
            {pathname.startsWith('/chat') ? (
              /* Chat route: no padding — chat manages its own height/scroll */
              <div className="w-full min-w-0 overflow-hidden" role="region">
                {children}
              </div>
            ) : (
              <div className="w-full max-w-full pt-4 pb-28 lg:pt-0 lg:pb-6 animate-in-page min-w-0 overflow-x-hidden pl-2 pr-4 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8 xl:pl-5 xl:pr-10 2xl:pl-6 2xl:pr-12" role="region">
                {children}
              </div>
            )}
          </main>
        </div>

        {/* ── Bottom Nav (mobile) ── */}
        <BottomNav userRole={userRole} />

        {/* ── Command Palette ── */}
        <CommandPalette
          userRole={userRole}
          onOpenChat={(channelId) => {
            chatCtx.openPanel();
            chatCtx.selectChannel(channelId);
          }}
        />

        {/* ── Asistente IA ── */}
        <AiHelpChatWidget />

        {/* ── Mobile Quick Create Modal ── */}
        {mobileCreateType && (
          <QuickCreateModal type={mobileCreateType} onClose={() => setMobileCreateType(null)} />
        )}
      </div>
    </CommandPaletteProvider>
  );
}
