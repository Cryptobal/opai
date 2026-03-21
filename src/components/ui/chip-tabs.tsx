"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface ChipTab {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string | number;
  /** "alert" = red badge (e.g. unseen leads), disappears when tab is active */
  badgeVariant?: "default" | "alert";
}

export interface ChipTabsProps {
  tabs: ChipTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** Center chips when ≤5 tabs. Default: true */
  centered?: boolean;
  /** When tabs > this value, use flex-wrap (2 rows) instead of horizontal scroll. Default: 8 */
  wrapThreshold?: number;
  /** Reduced vertical padding for tight headers */
  compact?: boolean;
}

/* ── Component ── */

export function ChipTabs({
  tabs,
  activeTab,
  onTabChange,
  centered = true,
  wrapThreshold = 8,
  compact = false,
}: ChipTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const useWrap = tabs.length > wrapThreshold;

  // Auto-scroll active chip into view (vertical when wrap, horizontal when scroll)
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
      inline: useWrap ? "nearest" : "center",
    });
  }, [activeTab, useWrap]);

  const shouldCenter = centered && tabs.length <= 5;

  return (
    <div
      ref={containerRef}
      className={cn(
        "chip-tabs-container flex gap-2 px-0",
        compact ? "py-1.5" : "py-3",
        "border-b border-white/[0.06]",
        useWrap ? "flex-wrap" : "overflow-x-auto",
        useWrap ? "justify-start" : shouldCenter ? "justify-center" : "justify-start"
      )}
      role="tablist"
      aria-label="Secciones"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "chip-tab inline-flex shrink-0 items-center gap-1.5 rounded-[20px] px-4 py-2 text-[13px] font-medium whitespace-nowrap",
              "transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
              "scroll-snap-align-center",
              isActive
                ? "bg-[#2DD4A0] text-[#0F1419] font-semibold shadow-[0_2px_8px_rgba(45,212,160,0.25)]"
                : "bg-white/[0.06] text-[#8899A6] font-medium"
            )}
          >
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
                      : "bg-red-500 text-white"
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
          </button>
        );
      })}
    </div>
  );
}
