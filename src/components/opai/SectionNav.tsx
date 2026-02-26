"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
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

type SectionNavLayout = "horizontal" | "vertical" | "auto";

interface SectionNavProps {
  sections: SectionNavItem[];
  className?: string;
  onSectionClick?: (key: string) => void;
  extraAction?: ReactNode;
  /** Layout mode. "auto" uses vertical when >7 sections. Default: "auto" */
  layout?: SectionNavLayout;
}

/** Threshold for switching to vertical layout in auto mode */
const VERTICAL_THRESHOLD = 7;

/**
 * Resolve the effective layout given the prop and section count.
 * Exported so DetailLayout can use the same logic.
 */
export function resolveSectionNavLayout(
  layout: SectionNavLayout | undefined,
  sectionCount: number
): "horizontal" | "vertical" {
  if (layout === "horizontal") return "horizontal";
  if (layout === "vertical") return "vertical";
  return sectionCount > VERTICAL_THRESHOLD ? "vertical" : "horizontal";
}

function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

export function SectionNav({
  sections,
  className,
  onSectionClick,
  extraAction,
  layout = "auto",
}: SectionNavProps) {
  const resolvedLayout = resolveSectionNavLayout(layout, sections.length);
  const windowWidth = useWindowWidth();

  // On mobile (<768px), always use horizontal even if resolved to vertical
  const effectiveLayout =
    resolvedLayout === "vertical" && windowWidth < 768
      ? "horizontal"
      : resolvedLayout;

  if (sections.length <= 1) return null;

  if (effectiveLayout === "vertical") {
    return (
      <VerticalSectionNav
        sections={sections}
        className={className}
        onSectionClick={onSectionClick}
        extraAction={extraAction}
        windowWidth={windowWidth}
      />
    );
  }

  return (
    <HorizontalSectionNav
      sections={sections}
      className={className}
      onSectionClick={onSectionClick}
      extraAction={extraAction}
    />
  );
}

/* ─── Horizontal Mode (original) ─── */

function HorizontalSectionNav({
  sections,
  className,
  onSectionClick,
  extraAction,
}: Omit<SectionNavProps, "layout">) {
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

  return (
    <div
      className={cn(
        "sticky top-[113px] z-[9] border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "-mx-2 px-4 sm:-mx-3 sm:px-6",
        "lg:-ml-2 lg:-mr-8 lg:pl-4 lg:pr-8",
        "xl:-ml-3 xl:-mr-10 xl:pl-6 xl:pr-10",
        "2xl:-ml-4 2xl:-mr-12 2xl:pl-6 2xl:pr-12",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
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

/* ─── Vertical Mode (sidebar) ─── */

function VerticalSectionNav({
  sections,
  className,
  onSectionClick,
  extraAction,
  windowWidth,
}: Omit<SectionNavProps, "layout"> & { windowWidth: number }) {
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.key ?? ""
  );
  // Expandido en tablet+ (≥768px), colapsado solo en móvil
  const [isExpanded, setIsExpanded] = useState(windowWidth >= 768);
  const isClickScrolling = useRef(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-collapse/expand on resize
  useEffect(() => {
    setIsExpanded(windowWidth >= 768);
  }, [windowWidth]);

  // Intersection observer to track active section
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

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`section-${key}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 800);
    },
    [onSectionClick]
  );

  return (
    <nav
      className={cn(
        "sticky top-[113px] z-[9] self-start shrink-0 border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-y-auto max-h-[calc(100vh-113px)] transition-[width] duration-200",
        isExpanded ? "w-[220px] min-w-[220px]" : "w-12",
        className
      )}
      role="tablist"
      aria-label="Secciones del registro"
    >
      <div className="flex items-center justify-end p-1.5 border-b border-border/50">
        {extraAction && isExpanded && (
          <div className="flex-1 pl-1">{extraAction}</div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={isExpanded ? "Colapsar navegación" : "Expandir navegación"}
        >
          {isExpanded ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="p-1.5 space-y-0.5">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.key;

          const tooltipLabel =
            section.count !== undefined && section.count > 0
              ? `${section.label} (${section.count})`
              : section.label;

          return (
            <div key={section.key} className="group/tip relative">
              <button
                type="button"
                role="tab"
                data-section={section.key}
                aria-selected={isActive}
                onClick={() => handleClick(section.key)}
                title={!isExpanded ? tooltipLabel : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md text-sm transition-colors",
                  isExpanded ? "px-3 py-2" : "justify-center px-0 py-2",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {isExpanded && (
                  <>
                    <span className="flex-1 text-left break-words min-w-0">{section.label}</span>
                    {section.count !== undefined && section.count > 0 && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {section.count > 99 ? "99+" : section.count}
                      </span>
                    )}
                  </>
                )}
              </button>
              {!isExpanded && (
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md group-hover/tip:block z-50">
                  {tooltipLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
