"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface ChipTab {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string | number;
}

export interface ChipTabsProps {
  tabs: ChipTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** Center chips when ≤5 tabs. Default: true */
  centered?: boolean;
}

/* ── Component ── */

export function ChipTabs({
  tabs,
  activeTab,
  onTabChange,
  centered = true,
}: ChipTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  const shouldCenter = centered && tabs.length <= 5;

  return (
    <div
      ref={containerRef}
      className={cn(
        "chip-tabs-container flex gap-2 overflow-x-auto px-4 py-3",
        "border-b border-white/[0.06]",
        shouldCenter ? "justify-center" : "justify-start"
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
                  "ml-0.5 rounded-[10px] px-[7px] py-px text-[11px] font-bold tabular-nums",
                  isActive
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
