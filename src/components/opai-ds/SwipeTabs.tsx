"use client";

/**
 * SwipeTabs — Tab bar con scroll horizontal + underline animado.
 *
 * Patrón mobile-first inspirado en Twitter/X, Instagram y la nueva nav de
 * HubSpot/Linear. En mobile se siente como una pestañas reales (swipe lateral,
 * snap, fade en bordes). En desktop se mantiene compacto con underline en el
 * tab activo.
 *
 * Características:
 *  - Tab activo con underline + texto bold + color primary.
 *  - Auto-scroll del tab activo a la vista (centrado horizontalmente).
 *  - Edge fades para indicar overflow.
 *  - 44px de alto mínimo (touch target accesible).
 *  - Smooth scroll con momentum nativo en iOS.
 *
 * Diferencia con `SubNav` (pills redondas):
 *  - SwipeTabs es para sub-secciones del MISMO tema (ej. EERR/Balance/Ventas
 *    dentro de Reportes). Es un primer-class navigation control.
 *  - SubNav es para "filtros" o categorías visuales (pills suaves).
 *
 * Cuándo usar cada uno:
 *  - N3 dentro de un módulo → SwipeTabs (lo que reemplaza los *Subnav.tsx).
 *  - Filtros, tags, secciones decorativas → SubNav o ChipTabs.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SwipeTabItem {
  href: string;
  label: string;
  /** Optional icon shown before the label */
  icon?: LucideIcon;
  /** When true, only matches when pathname === href exactly */
  exactMatch?: boolean;
  /** Optional badge (number or short string like "99+") */
  badge?: string | number;
}

export interface SwipeTabsProps {
  items: SwipeTabItem[];
  className?: string;
  /** When true, applies subtle styling for nested contexts */
  variant?: "default" | "compact";
  /** Optional trailing slot rendered after the tabs (e.g. "Add" button) */
  trailingAction?: React.ReactNode;
}

export function SwipeTabs({
  items,
  className,
  variant = "default",
  trailingAction,
}: SwipeTabsProps) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Longest-prefix-wins so /finanzas/reportes/eerr highlights "Estado de Resultado"
  // not the parent /finanzas/reportes (Dashboard).
  const activeHref = items
    .filter((i) =>
      i.exactMatch
        ? pathname === i.href
        : pathname === i.href || pathname?.startsWith(i.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Auto-scroll active tab into view (centered) on mount and when active changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !activeHref) return;
    const activeEl = container.querySelector(
      `[data-href="${activeHref}"]`,
    ) as HTMLElement | null;
    if (!activeEl) return;
    activeEl.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeHref]);

  // Measure active tab and update sliding indicator
  const updateIndicator = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !activeHref) {
      setIndicator(null);
      return;
    }
    const activeEl = container.querySelector(
      `[data-href="${activeHref}"]`,
    ) as HTMLElement | null;
    if (!activeEl) {
      setIndicator(null);
      return;
    }
    const cRect = container.getBoundingClientRect();
    const aRect = activeEl.getBoundingClientRect();
    setIndicator({
      left: aRect.left - cRect.left + container.scrollLeft,
      width: aRect.width,
    });
  }, [activeHref]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, items.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateIndicator, { passive: true });
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateIndicator);
      ro.disconnect();
    };
  }, [updateIndicator]);

  // Track edge fades for overflow hint
  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setShowLeftFade(false);
      setShowRightFade(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 4);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFades);
      ro.disconnect();
    };
  }, [updateFades]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Sub-secciones"
      className={cn(
        "relative flex items-center gap-2 border-b border-ds-border-subtle",
        variant === "compact" ? "min-h-[44px]" : "min-h-[48px]",
        className,
      )}
    >
      <div
        ref={scrollRef}
        role="tablist"
        className={cn(
          "flex flex-1 items-stretch gap-1 overflow-x-auto",
          // Hide scrollbar but keep scroll behavior (iOS momentum)
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          // Snap the tabs to start so swipes feel deliberate
          "snap-x snap-mandatory sm:snap-none",
        )}
      >
        {items.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-href={item.href}
              data-active={isActive ? "true" : "false"}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "group relative inline-flex shrink-0 snap-center items-center gap-1.5 px-3 sm:px-4",
                variant === "compact" ? "h-11" : "h-12",
                "text-[13px] sm:text-sm",
                "transition-all duration-200 ease-out",
                "whitespace-nowrap",
                isActive
                  ? "text-foreground font-semibold"
                  : "text-ds-text-3 hover:text-ds-text-1 hover:-translate-y-0.5",
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-ds-text-3",
                  )}
                />
              )}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== 0 && item.badge !== "0" && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-ds-surface-3 text-ds-text-3",
                  )}
                >
                  {typeof item.badge === "number" && item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
              {/* Hover-only underline (active state uses the shared sliding indicator) */}
              {!isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 sm:inset-x-3 -bottom-px h-[2px] rounded-full bg-transparent group-hover:bg-ds-border-default transition-colors duration-200"
                />
              )}
            </Link>
          );
        })}

        {/* Sliding active indicator (Linear/Vercel style) */}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px h-[2px] rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>

      {/* Trailing action (optional, e.g. "+ Nueva") */}
      {trailingAction && (
        <div className="shrink-0 pl-2 sm:pl-3">{trailingAction}</div>
      )}

      {/* Edge fades */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background via-background/80 to-transparent transition-opacity duration-200",
          showLeftFade ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent transition-opacity duration-200",
          showRightFade ? "opacity-100" : "opacity-0",
        )}
      />
    </nav>
  );
}
