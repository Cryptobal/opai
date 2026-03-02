"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PanelLeftOpen, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssociatedSection {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  content: ReactNode;
  /** Show "+" button for creating new associated records (CRM entities only) */
  onAdd?: () => void;
  /** Link for "+" button instead of callback */
  addHref?: string;
  /** Start expanded */
  defaultOpen?: boolean;
}

interface AssociatedRecordsPanelProps {
  sections: AssociatedSection[];
  className?: string;
}

export function AssociatedRecordsPanel({
  sections,
  className,
}: AssociatedRecordsPanelProps) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((s) => {
      if (s.defaultOpen) initial.add(s.id);
    });
    return initial;
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("opai-associated-panel-collapsed");
    if (saved === "1") setIsDesktopCollapsed(true);
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDesktopPanel = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("opai-associated-panel-collapsed", next ? "1" : "0");
      return next;
    });
  };

  if (sections.length === 0) return null;

  return (
    <>
      {/* Desktop: panel lateral derecho */}
      <aside
        className={cn(
          "hidden lg:block shrink-0 border-l border-border/60 overflow-y-auto transition-all duration-200",
          isDesktopCollapsed ? "w-10" : "w-[300px] xl:w-[340px]",
          "sticky top-12 h-[calc(100vh-48px)]",
          className
        )}
      >
        {isDesktopCollapsed ? (
          <div className="h-full w-full flex flex-col items-center pt-4 gap-3">
            <button
              type="button"
              onClick={toggleDesktopPanel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/40 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              aria-label="Expandir panel asociados"
              title="Expandir asociados"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180 select-none mt-1">
              Asociados
            </div>
          </div>
        ) : (
          <div className="px-3 py-3">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Registros asociados
              </h3>
              <button
                type="button"
                onClick={toggleDesktopPanel}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                aria-label="Colapsar panel asociados"
                title="Colapsar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {sections.map((section) => (
                <AccordionItem
                  key={section.id}
                  section={section}
                  isOpen={expanded.has(section.id)}
                  onToggle={() => toggle(section.id)}
                />
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile: acordeon al final de la pagina */}
      <div className="lg:hidden mt-6 border-t border-border/60 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
          Registros asociados
        </h3>
        <div className="space-y-0.5">
          {sections.map((section) => (
            <AccordionItem
              key={section.id}
              section={section}
              isOpen={expanded.has(section.id)}
              onToggle={() => toggle(section.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AccordionItem({
  section,
  isOpen,
  onToggle,
}: {
  section: AssociatedSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;
  const hasAdd = section.onAdd || section.addHref;

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      isOpen ? "border-border/50 bg-card/40" : "border-transparent hover:border-border/30 hover:bg-card/20"
    )}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg transition-colors min-w-0"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate font-medium text-foreground text-[13px]">{section.label}</span>
          {section.count !== undefined && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              ({section.count})
            </span>
          )}
        </button>
        {hasAdd && (
          section.addHref ? (
            <Link
              href={section.addHref}
              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mr-1"
              aria-label={`Agregar ${section.label}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={section.onAdd}
              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mr-1"
              aria-label={`Agregar ${section.label}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>
      {isOpen && (
        <div className="px-2.5 pb-3 pt-1 animate-in slide-in-from-top-1 duration-200 max-h-[60vh] overflow-y-auto border-t border-border/30">
          {section.content}
        </div>
      )}
    </div>
  );
}
