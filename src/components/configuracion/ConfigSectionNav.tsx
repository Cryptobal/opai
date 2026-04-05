"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ConfigSection {
  key: string;
  title: string;
  count: number;
}

interface ConfigSectionNavProps {
  sections: ConfigSection[];
  activeSection: string;
  onSelect: (key: string) => void;
}

export function ConfigSectionNav({ sections, activeSection, onSelect }: ConfigSectionNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeBtn = scrollRef.current.querySelector<HTMLElement>(
      `[data-section="${activeSection}"]`,
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeSection]);

  return (
    <div
      ref={scrollRef}
      className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide snap-x snap-mandatory"
    >
      {sections.map((section) => {
        const isActive = activeSection === section.key;
        return (
          <button
            key={section.key}
            data-section={section.key}
            onClick={() => onSelect(section.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 shrink-0 snap-start border",
              isActive
                ? "bg-primary/12 text-primary border-primary/25"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground border-transparent",
            )}
          >
            <span>{section.title}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] tabular-nums transition-colors",
                isActive ? "bg-primary/10 text-primary/80" : "bg-muted/50 text-muted-foreground/70",
              )}
            >
              {section.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
