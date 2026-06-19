"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface ChipTab {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string | number;
  /** "alert" = red badge (e.g. unseen leads), disappears when tab is active */
  badgeVariant?: "default" | "alert";
  /** Si está definido, el chip navega en lugar de cambiar de tab */
  href?: string;
}

export interface ChipTabsProps {
  tabs: ChipTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** Center chips when ≤5 tabs. Default: true */
  centered?: boolean;
  /** Threshold for desktop wrap. On mobile we always use horizontal scroll. Default: 8 */
  wrapThreshold?: number;
  /** Reduced vertical padding for tight headers */
  compact?: boolean;
}

/* ── Component ──
 *
 * Mobile (<sm): horizontal snap scroll + gradient fade on the right edge that
 * hints at overflow. Keeps tab bar to a single row.
 *
 * Desktop (≥sm): wraps to multiple rows when tabs exceed `wrapThreshold`,
 * otherwise horizontal scroll with center alignment when few tabs.
 */

export function ChipTabs({
  tabs,
  activeTab,
  onTabChange,
  centered = true,
  wrapThreshold = 8,
  compact = false,
}: ChipTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const desktopWrap = tabs.length > wrapThreshold;
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Auto-scroll active chip into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector(
      `[data-tab="${activeTab}"]`
    ) as HTMLElement | null;
    if (!activeEl) return;

    activeEl.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab]);

  // Track scroll fade visibility (desktop always shows gradient hint too)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftFade(scrollLeft > 4);
      setShowRightFade(scrollLeft + clientWidth < scrollWidth - 4);
    };

    update();
    container.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(container);

    return () => {
      container.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [tabs.length]);

  const shouldCenter = centered && tabs.length <= 5;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          "chip-tabs-container flex gap-2 px-0",
          compact ? "py-1.5" : "py-3",
          "border-b border-white/[0.06]",
          // Mobile: always horizontal scroll, single row
          "overflow-x-auto",
          // Desktop: wrap when many tabs, else scroll + center if few
          desktopWrap
            ? "sm:flex-wrap sm:overflow-x-visible sm:justify-start"
            : shouldCenter
              ? "sm:justify-center"
              : "sm:justify-start",
        )}
        role="tablist"
        aria-label="Secciones"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          const chipClassName = cn(
            "chip-tab inline-flex shrink-0 items-center gap-1.5 rounded-[20px] px-4 py-2 text-[13px] font-medium whitespace-nowrap",
            "transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
            "scroll-snap-align-center",
            isActive
              ? "bg-[#2DD4A0] text-[#0F1419] font-semibold shadow-[0_2px_8px_rgba(45,212,160,0.25)]"
              : "bg-white/[0.06] text-[#8899A6] font-medium active:bg-white/[0.1]"
          );

          const chipContent = (
            <>
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-[#0F1419]" : "text-[#8899A6]"
                  )}
                />
              )}
              {tab.label}
              {tab.badge !== undefined && tab.badge !== 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 text-[10px] font-bold tabular-nums",
                    tab.badgeVariant === "alert"
                      ? isActive
                        ? "hidden"
                        : "bg-status-danger text-white"
                      : isActive
                        ? "bg-[rgba(15,20,25,0.25)] text-[#0F1419]"
                        : "bg-[rgba(45,212,160,0.2)] text-[#2DD4A0]"
                  )}
                >
                  {typeof tab.badge === "number" && tab.badge > 99
                    ? "99+"
                    : tab.badge}
                </span>
              )}
            </>
          );

          if (tab.href) {
            return (
              <Link
                key={tab.id}
                href={tab.href}
                data-tab={tab.id}
                className={chipClassName}
              >
                {chipContent}
              </Link>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab={tab.id}
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={chipClassName}
            >
              {chipContent}
            </button>
          );
        })}
      </div>

      {/* Edge fades to hint at overflow. Hidden on desktop when wrapping. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity duration-200",
          showLeftFade ? "opacity-100" : "opacity-0",
          desktopWrap && "sm:hidden",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-200",
          showRightFade ? "opacity-100" : "opacity-0",
          desktopWrap && "sm:hidden",
        )}
      />
    </div>
  );
}
