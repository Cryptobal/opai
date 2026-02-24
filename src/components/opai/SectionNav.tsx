"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface SectionNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

interface SectionNavProps {
  sections: SectionNavItem[];
  className?: string;
  onSectionClick?: (key: string) => void;
  extraAction?: ReactNode;
}

export function SectionNav({
  sections,
  className,
  onSectionClick,
  extraAction,
}: SectionNavProps) {
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.key ?? ""
  );
  const [hasOverflow, setHasOverflow] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const isClickScrolling = useRef(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const sectionIds = sections.map((s) => `section-${s.key}`);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;

        let maxRatio = 0;
        let maxKey = activeSection;

        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxKey = entry.target.id.replace("section-", "");
          }
        }

        if (maxRatio < 0.1) {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              maxKey = entry.target.id.replace("section-", "");
              break;
            }
          }
        }

        if (maxKey) setActiveSection(maxKey);
      },
      {
        rootMargin: "-120px 0px -50% 0px",
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, activeSection]);

  const handleClick = useCallback(
    (key: string) => {
      onSectionClick?.(key);
      isClickScrolling.current = true;
      setActiveSection(key);

      const scrollAfterExpand = () => {
        const el = document.getElementById(`section-${key}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollAfterExpand();
        });
      });

      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 800);
    },
    [onSectionClick]
  );

  useEffect(() => {
    const container = navRef.current;
    if (!container) return;
    const activeEl = container.querySelector(
      `[data-section="${activeSection}"]`
    ) as HTMLElement | null;
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const scrollLeft =
      container.scrollLeft +
      (elRect.left - containerRect.left) -
      containerRect.width / 2 +
      elRect.width / 2;

    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [activeSection]);

  useEffect(() => {
    const container = navRef.current;
    if (!container) return;

    const recalc = () => {
      setHasOverflow(container.scrollWidth > container.clientWidth + 2);
    };

    recalc();
    const resizeObserver = new ResizeObserver(recalc);
    resizeObserver.observe(container);
    window.addEventListener("resize", recalc);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, [sections]);

  if (sections.length <= 1) return null;

  return (
    <div
      className={cn(
        "sticky top-[113px] z-[9] -mx-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "sm:-mx-6 lg:-mx-8 xl:-mx-10 2xl:-mx-12",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div
          ref={navRef}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide"
          role="tablist"
          aria-label="Secciones del registro"
        >
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.key;

            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                data-section={section.key}
                aria-selected={isActive}
                onClick={() => handleClick(section.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors whitespace-nowrap sm:gap-1.5 sm:px-3",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{section.label}</span>
                {section.count !== undefined && section.count > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {section.count > 99 ? "99+" : section.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary sm:left-3 sm:right-3" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {hasOverflow && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label="Más secciones"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sections.map((section) => (
                  <DropdownMenuItem
                    key={section.key}
                    onClick={() => handleClick(section.key)}
                  >
                    {section.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {extraAction && <div className="hidden lg:block">{extraAction}</div>}
        </div>
      </div>
    </div>
  );
}
