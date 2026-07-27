'use client';

import { cloneElement, isValidElement, ReactElement, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CommandPalette, CommandPaletteProvider, useCommandPalette } from './CommandPalette';
import { MobileIsland } from './MobileIsland';
import { TopbarActions } from './TopbarActions';
import { QuickCreateModal, type QuickCreateType } from './QuickCreateModal';
import { AiHelpChatWidgetV2 as AiHelpChatWidget } from './AiHelpChatWidgetV2';
import { ChatPageContextProvider } from './ChatPageContextProvider';
import { SimulationBanner } from '@/components/navbar/SimulationBanner';
import { BottomNav } from './BottomNav';
import { BottomNavPortal } from './BottomNavPortal';
import { useChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';
import { ChatSidePanel } from '@/components/chat/ChatSidePanel';
import { useNotificationSidePanelContext } from '@/components/notifications/NotificationSidePanelContext';
import { NotificationSidePanel } from '@/components/notifications/NotificationSidePanel';
import { useIntelligenceSidePanelContext } from '@/components/opai/IntelligenceSidePanelContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { PlatformDataAttribute } from '@/components/opai/portal-shell';
import { useIsIOS } from '@/hooks/usePlatform';
import {
  BreadcrumbTrailingProvider,
  useBreadcrumbTrailing,
  FxIndicator,
  GlassAmbient,
  IslandActionProvider,
  TopbarSubNav,
} from '@/components/opai-ds';
import { resolveNavContext } from '@/lib/nav/resolve-context';

export interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  className?: string;
}

/** Rutas que en móvil toman la pantalla completa: sin isla topbar,
 *  sin breadcrumbs, sin padding de página. BottomNav se mantiene. */
const IMMERSIVE_MOBILE_PREFIXES = ['/crm/correos'];

/**
 * DocumentTitle — mantiene `document.title` sincronizado con la ruta activa
 * usando el registry (`resolveNavContext`) y el trailing publicado por las
 * fichas (`useSetBreadcrumbTrailing`). No toca el `metadata` de las páginas;
 * solo el título del tab del navegador. Vive dentro del
 * BreadcrumbTrailingProvider para leer el trailing.
 */
function DocumentTitle() {
  const pathname = usePathname() ?? '/';
  const trailing = useBreadcrumbTrailing();
  useEffect(() => {
    const ctx = resolveNavContext(pathname);
    const label = trailing || ctx?.shortTitle || ctx?.title;
    document.title = label ? `${label} · OPAI` : 'OPAI';
  }, [pathname, trailing]);
  return null;
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
  const isImmersiveMobile = IMMERSIVE_MOBILE_PREFIXES.some((p) => pathname.startsWith(p));
  const chatCtx = useChatSidePanelContext();
  const notifCtx = useNotificationSidePanelContext();
  const intelCtx = useIntelligenceSidePanelContext();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const { open: openCommandPalette } = useCommandPalette();
  const isIOS = useIsIOS();

  // Close sibling docks when one opens (chat / notif / intelligence)
  const handleToggleChat = useCallback(() => {
    if (!chatCtx.isPanelOpen) {
      notifCtx.closePanel();
      intelCtx.closePanel();
    }
    chatCtx.togglePanel();
  }, [chatCtx, notifCtx, intelCtx]);
  const handleToggleNotifications = useCallback(() => {
    if (!notifCtx.isPanelOpen) {
      chatCtx.closePanel();
      intelCtx.closePanel();
    }
    notifCtx.togglePanel();
  }, [chatCtx, notifCtx, intelCtx]);

  const anyPanelOpen =
    chatCtx.isPanelOpen || notifCtx.isPanelOpen || intelCtx.isPanelOpen;
  // "Sheet focus" (route-scoped): la planilla del flujo de caja es una hoja de
  // cálculo a pantalla completa en mobile — sin breadcrumbs ni padding
  // horizontal, solo topbar + hoja + bottom nav. Desktop conserva el shell
  // normal (sidebar/topbar/breadcrumbs). El data attribute permite a los
  // layouts intermedios aplanar sus espaciadores solo dentro del modo.
  const isSheetFocus = pathname === '/finanzas/flujo-caja/planilla';
  // Sidebar default: si el usuario no eligió antes, abrimos en viewports ≥ xl
  // (1280px) para que en pantallas grandes la nav N2 sea visible sin hover.
  // En lg (1024–1279) queda colapsado para no comer ancho.
  //
  // El estado inicial SIEMPRE arranca en `false` (igual en servidor y en el
  // primer render del cliente): leer localStorage/matchMedia directo en el
  // initializer de useState hacía que SSR devolviera `false` (sin `window`)
  // pero la hidratación del cliente devolviera otra cosa según lo guardado,
  // lo que React detecta como "Hydration failed" y fuerza un re-render de
  // TODO el árbol (AppShell completo) en cada carga — el jank que rompía la
  // fluidez en mobile. La preferencia real se aplica después del mount, en
  // el efecto de abajo: un solo re-render normal en vez de descartar el HTML
  // del servidor.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('opai-sidebar-open');
      if (stored !== null) {
        setIsSidebarOpen(stored === 'true');
        return;
      }
      // Sin preferencia guardada → expandido en xl+, colapsado en lg.
      if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches) {
        setIsSidebarOpen(true);
      }
    } catch { /* localStorage inaccesible (Safari privado, etc.): queda colapsado */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem('opai-sidebar-open', String(isSidebarOpen)); } catch {}
  }, [isSidebarOpen]);
  return (
    <BreadcrumbTrailingProvider>
      <IslandActionProvider>
      <DocumentTitle />
      <PlatformDataAttribute />
      <GlassAmbient />
      <div className="relative min-h-[100dvh] overflow-x-clip">
        {/* ── Isla contextual móvil (A/B/C/D) ── */}
        {/* En rutas inmersivas el módulo pinta su propio top móvil (la isla
            ya es lg:hidden, así que desktop no cambia al no renderizarla). */}
        {sidebar && !isImmersiveMobile && (
          <MobileIsland
            onSearch={() => openCommandPalette()}
            onToggleChat={handleToggleChat}
            onToggleNotifications={handleToggleNotifications}
            chatUnread={chatCtx.totalUnread}
            notifUnread={notifUnreadCount}
          />
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
            // isla flotante (safe + 8px + 48px + 8px gap) en mobile; desktop 3rem.
            // Inmersivo: sin isla → solo safe-area arriba en móvil.
            isImmersiveMobile
              ? 'pt-[env(safe-area-inset-top,0px)] lg:pt-12'
              : 'pt-[calc(4rem+env(safe-area-inset-top,0px))] lg:pt-12',
            isSidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]',
            anyPanelOpen && 'xl:mr-[400px]',
            className
          )}
        >
          {/* Topbar desktop — fija al viewport.
              Izquierda: tabs del módulo activo (ModuleSubNav, auto-detect por
              pathname; null si la ruta no tiene N3). Derecha: indicador UF/UTM,
              botón buscar y el clúster de acciones (theme/chat/notif/config). */}
          <div className={cn(
            "hidden lg:flex fixed top-0 right-0 z-20 h-12 items-stretch shrink-0 transition-[left,right] duration-300 ease-out",
            isIOS
              ? "opai-liquid-glass-bar-top"
              : "border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
            isSidebarOpen ? 'left-64' : 'left-[72px]',
            anyPanelOpen && 'right-[400px]',
          )}>
            {/* Zona de tabs: siempre ocupa el espacio disponible (aunque
                TopbarSubNav devuelva null en rutas sin secciones) para empujar
                el clúster derecho al borde. TopbarSubNav muestra solo tabs N3
                del submódulo activo (Finanzas, Ops); cambiar N2 es por sidebar. */}
            <div className="flex-1 min-w-0 flex items-stretch overflow-hidden pl-3">
              <TopbarSubNav className="flex-1 min-w-0" />
            </div>
            {/* Clúster derecho: FX + acciones. Agrupado y alineado al centro del h-12. */}
            <div className="flex h-full items-center gap-2.5 pl-3 pr-3 shrink-0 border-l border-ds-border-subtle">
              <FxIndicator />
              <TopbarActions
                userName={userName}
                userEmail={userEmail}
                userRole={userRole}
                onSearch={() => openCommandPalette()}
              />
            </div>
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
              /*
                Nav limpia v1: sin breadcrumb ni PageHero. El contexto de la
                página vive en la barra superior (tabs del módulo) en desktop y
                en la isla contextual en móvil. El contenido arranca pegado
                arriba para recuperar el alto vertical. Las fichas publican el
                nombre de la entidad vía `useSetBreadcrumbTrailing` que la isla
                y el document.title consumen.
              */
              <div
                data-layout-mode={isSheetFocus ? 'sheet-focus' : undefined}
                className={cn(
                  'w-full max-w-full animate-in-page min-w-0 lg:pt-0 lg:pb-6 lg:px-8 xl:px-10 2xl:px-12',
                  // Inmersivo móvil (correos): el módulo ocupa todo el ancho
                  // sin paddings de página y pinta su propio top móvil.
                  isImmersiveMobile && 'overflow-x-clip pt-0 pb-0 px-0',
                  // Sheet focus (planilla flujo de caja): full-bleed móvil
                  // entre topbar y bottom nav; sin overflow-x-clip en móvil
                  // (el scroll horizontal vive DENTRO de la hoja).
                  isSheetFocus && 'pt-1 pb-0 px-0 lg:overflow-x-clip',
                  // Default: contenido pegado a la isla en móvil (padding-top
                  // mínimo) y con un respiro moderado bajo la barra en desktop.
                  !isImmersiveMobile && !isSheetFocus &&
                    'overflow-x-clip pt-2 pb-28 px-4 sm:px-6 lg:pt-4',
                )}
                role="region"
              >
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

      </div>

      {/* ── Bottom Nav and Side Panels (outside overflow-x-hidden to avoid fixed clipping on iOS) ── */}
      {/* BottomNav goes through a portal to body to bypass any ancestor that
          creates a containing block (transform/filter/backdrop-filter) and
          breaks `position: fixed`. */}
      <BottomNavPortal>
        <BottomNav userRole={userRole} />
      </BottomNavPortal>
      {/* Intelligence dock al mismo nivel que Chat/Notif para fixed right-0 correcto. */}
      <AiHelpChatWidget />
      <ChatSidePanel userRole={userRole} />
      <NotificationSidePanel />
      </IslandActionProvider>
    </BreadcrumbTrailingProvider>
  );
}
