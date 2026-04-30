'use client';

import { cloneElement, isValidElement, ReactElement, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommandPalette, CommandPaletteProvider, useCommandPalette } from './CommandPalette';
import { ThemeLogo } from './ThemeLogo';
import { TopbarActions } from './TopbarActions';
import { QuickCreateModal, type QuickCreateType } from './QuickCreateModal';
import { AiHelpChatWidgetV2 as AiHelpChatWidget } from './AiHelpChatWidgetV2';
import { ChatPageContextProvider } from './ChatPageContextProvider';
import { SimulationBanner } from '@/components/navbar/SimulationBanner';
import { BottomNav } from './BottomNav';
import { useChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';
import { ChatSidePanel } from '@/components/chat/ChatSidePanel';
import { useNotificationSidePanelContext } from '@/components/notifications/NotificationSidePanelContext';
import { NotificationSidePanel } from '@/components/notifications/NotificationSidePanel';
import { useNotifications } from '@/contexts/NotificationContext';
import { PlatformDataAttribute } from '@/components/opai/portal-shell';
import { useIsIOS } from '@/hooks/usePlatform';

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
export function AppShell(props: AppShellProps) {
  return (
    <CommandPaletteProvider>
      <ChatPageContextProvider>
        <AppShellInner {...props} />
      </ChatPageContextProvider>
    </CommandPaletteProvider>
  );
}

function AppShellInner({
  sidebar,
  children,
  userName,
  userEmail,
  userRole,
  className,
}: AppShellProps) {
  const pathname = usePathname();
  const chatCtx = useChatSidePanelContext();
  const notifCtx = useNotificationSidePanelContext();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const { open: openCommandPalette } = useCommandPalette();
  const isIOS = useIsIOS();

  // Close notification panel when chat opens and vice versa
  const handleToggleChat = useCallback(() => {
    if (!chatCtx.isPanelOpen) notifCtx.closePanel();
    chatCtx.togglePanel();
  }, [chatCtx, notifCtx]);
  const handleToggleNotifications = useCallback(() => {
    if (!notifCtx.isPanelOpen) chatCtx.closePanel();
    notifCtx.togglePanel();
  }, [chatCtx, notifCtx]);

  const anyPanelOpen = chatCtx.isPanelOpen || notifCtx.isPanelOpen;
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('opai-sidebar-open');
      return stored !== null ? stored === 'true' : false;
    } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('opai-sidebar-open', String(isSidebarOpen)); } catch {}
  }, [isSidebarOpen]);
  return (
    <>
      <PlatformDataAttribute />
      <div className="relative min-h-[100dvh] overflow-x-clip">
        {/* ── Mobile topbar (redesigned — no hamburger, no sidebar) ── */}
        {sidebar && (
          <header
            className={cn(
              "fixed top-0 left-0 right-0 z-30 flex min-h-12 items-center justify-between lg:hidden",
              isIOS
                ? "opai-liquid-glass-bar-top"
                : "border-b border-border/50 bg-background/95 backdrop-blur-md",
            )}
            style={{
              paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
              paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
              paddingTop: 'env(safe-area-inset-top)',
            }}
          >
            {/* Left: Logo */}
            <Link href="/hub" className="flex items-center gap-2 hover:opacity-80 shrink-0">
              <ThemeLogo width={28} height={28} className="h-7 w-7" />
              <span className="text-sm font-semibold tracking-tight">OPAI</span>
            </Link>

            {/* Right: Search, Chat, Notifications */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
                onClick={() => openCommandPalette()}
                aria-label="Buscar"
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
                onClick={handleToggleChat}
                aria-label="Abrir chat"
              >
                <MessageCircle className="h-5 w-5" />
                {chatCtx.totalUnread > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
                )}
              </button>
              <button
                type="button"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
                onClick={handleToggleNotifications}
                aria-label="Notificaciones"
              >
                <Bell className="h-5 w-5" />
                {notifUnreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
                )}
              </button>
            </div>
          </header>
        )}

        {/* ── Desktop sidebar (unchanged) ── */}
        {sidebar && (
          <div className="hidden lg:block">
            {isValidElement(sidebar)
              ? cloneElement(
                sidebar as ReactElement<{
                  onToggleSidebar?: () => void;
                  isSidebarOpen?: boolean;
                }>,
                {
                  isSidebarOpen,
                  onToggleSidebar: () => setIsSidebarOpen((prev) => !prev),
                }
              )
              : sidebar}
          </div>
        )}

        {/* ── Main content ── */}
        <div
          className={cn(
            'transition-[padding,margin] duration-300 ease-out min-w-0',
            'pt-[calc(3rem+env(safe-area-inset-top,0px))] lg:pt-12', // espacio para topbar fija (min-h-12 = 3rem) en mobile y desktop
            isSidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]',
            anyPanelOpen && 'xl:mr-[400px]',
            className
          )}
        >
          {/* Topbar actions desktop — fija al viewport */}
          <div className={cn(
            "hidden lg:flex fixed top-0 right-0 z-20 h-12 items-center gap-3 px-4 shrink-0 transition-[left,right] duration-300 ease-out",
            isIOS
              ? "opai-liquid-glass-bar-top"
              : "border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
            isSidebarOpen ? 'left-64' : 'left-[72px]',
            anyPanelOpen && 'right-[400px]',
          )}>
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
              <div className="w-full max-w-full pt-4 pb-28 lg:pt-0 lg:pb-6 animate-in-page min-w-0 overflow-x-clip px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12" role="region">
                {children}
              </div>
            )}
          </main>
        </div>

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
      </div>

      {/* ── Bottom Nav and Side Panels (outside overflow-x-hidden to avoid fixed clipping on iOS) ── */}
      <BottomNav userRole={userRole} />
      <ChatSidePanel userRole={userRole} />
      <NotificationSidePanel />
    </>
  );
}
