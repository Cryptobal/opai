"use client";

/**
 * SubNav — Pill navigation visible on all breakpoints
 *
 * Desktop (lg+): Pills horizontales con iconos
 * Mobile/tablet: Scroll horizontal con fade-out cuando desborda
 * Tab activo: borde verde + fondo sutil
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SubNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** When true, tab is active only on exact path match (useful for "Dashboard"/"Inicio" items) */
  exactMatch?: boolean;
}

interface SubNavProps {
  items: SubNavItem[];
  className?: string;
}

export function SubNav({ items, className }: SubNavProps) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow]);

  // Longest-prefix-wins so a more specific item (e.g. /opai/documentos/templates)
  // doesn't also activate its parent (/opai/documentos).
  const activeHref = items
    .filter((i) =>
      i.exactMatch
        ? pathname === i.href
        : pathname === i.href || pathname?.startsWith(i.href + "/")
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className={cn("mb-4 relative block", className)}>
      <div ref={scrollRef} className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors shrink-0",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {item.label}
            </Link>
          );
        })}
      </div>
      {/* Fade-out gradient to indicate more content */}
      {showFade && (
        <div className="absolute right-0 top-0 bottom-1 w-8 pointer-events-none bg-gradient-to-l from-background to-transparent" />
      )}
    </nav>
  );
}
