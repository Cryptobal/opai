'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getBottomNavItems } from '@/lib/module-nav';
import { usePermissions } from '@/lib/permissions-context';
import { ChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';

/** Tracks BottomNav real height and exposes it as --bottom-nav-height CSS variable */
function useBottomNavHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--bottom-nav-height');
    };
  }, [ref]);
}

interface BottomNavProps {
  userRole?: string;
}

/**
 * BottomNav — Barra de navegación inferior contextual (mobile-first).
 *
 * Patrón Salesforce/HubSpot Mobile:
 * - En rutas generales: muestra módulos principales (Inicio, Chat, Comercial, Ops, etc.; Config solo en top bar)
 * - Dentro de un módulo: muestra subcategorías del módulo con iconos
 * - En páginas de detalle CRM: muestra las secciones del registro (scroll a anclas)
 *
 * Se oculta en desktop (lg+) donde la sidebar maneja la navegación.
 * Usa permisos del contexto para filtrar items (si disponible).
 */
export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname();
  const permissions = usePermissions();

  if (!userRole || !pathname) return null;

  // Usar permisos resueltos si están disponibles, sino fallback a role string
  const permsOrRole = permissions.modules && Object.keys(permissions.modules).length > 0
    ? permissions
    : userRole;
  const items = getBottomNavItems(pathname, permsOrRole);

  if (items.length === 0) return null;

  const hasSectionItems = items.some((item) => item.isSection);

  if (hasSectionItems) {
    return <SectionBottomNav items={items} />;
  }

  return <LinkBottomNav items={items} pathname={pathname} />;
}

/* ── Link-based bottom nav (module navigation) ── */

function LinkBottomNav({
  items,
  pathname,
}: {
  items: ReturnType<typeof getBottomNavItems>;
  pathname: string;
}) {
  const compact = items.length > 5;
  const navRef = useRef<HTMLElement>(null);
  useBottomNavHeight(navRef);

  // Read chat unread count from context (null-safe — returns 0 if no provider)
  const chatCtx = useContext(ChatSidePanelContext);
  const chatUnread = chatCtx?.totalUnread ?? 0;

  return (
    <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden">
      <div
        className={cn(
          "flex items-center justify-around h-14 px-1 pb-[env(safe-area-inset-bottom)]",
          compact && "overflow-x-auto scrollbar-hide"
        )}
      >
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          const unread = item.key === 'chat' && chatUnread > 0 ? chatUnread : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 transition-all min-w-0 shrink-0 active:scale-95",
                compact ? "px-1.5" : "px-3",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-primary" />
              )}
              <span className={cn("relative flex items-center justify-center rounded-lg", isActive && "bg-primary/10 p-1")}>
                <Icon className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "font-medium truncate max-w-full w-full text-center leading-tight",
                  compact ? "text-[8px]" : "text-[10px]"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Section-based bottom nav (detail page scroll navigation) ── */

function SectionBottomNav({
  items,
}: {
  items: ReturnType<typeof getBottomNavItems>;
}) {
  const [activeSection, setActiveSection] = useState(items[0]?.key.replace('section-', '') || '');
  const isClickScrolling = useRef(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const compact = items.length > 5;

  // IntersectionObserver to track active section
  useEffect(() => {
    const sectionIds = items.map((item) => item.href.replace('#', ''));
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;

        let maxRatio = 0;
        let maxKey = '';

        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxKey = entry.target.id.replace('section-', '');
          }
        }

        if (maxRatio < 0.1) {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              maxKey = entry.target.id.replace('section-', '');
              break;
            }
          }
        }

        if (maxKey) setActiveSection(maxKey);
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleClick = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (!el) return;

    isClickScrolling.current = true;
    setActiveSection(sectionId.replace('section-', ''));

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 800);
  }, []);

  const navRef = useRef<HTMLElement>(null);
  useBottomNavHeight(navRef);

  return (
    <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden">
      <div
        className={cn(
          "flex items-center overflow-x-auto scrollbar-hide h-14 px-1 pb-[env(safe-area-inset-bottom)]"
        )}
      >
        {items.map((item) => {
          const sectionKey = item.key.replace('section-', '');
          const sectionId = item.href.replace('#', '');
          const isActive = activeSection === sectionKey;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleClick(sectionId)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 transition-colors min-w-0 shrink-0 flex-1",
                compact ? "px-1" : "px-2",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary" />
              )}
              <Icon className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
              <span
                className={cn(
                  "font-medium truncate max-w-full w-full text-center leading-tight",
                  compact ? "text-[8px]" : "text-[10px]"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
