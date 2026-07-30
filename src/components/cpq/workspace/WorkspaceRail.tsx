"use client";

/**
 * Rail izquierdo de secciones del workspace (desktop). Navega con scroll a la
 * sección y la expande; marca la sección activa con IntersectionObserver.
 */

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from "./types";

export function WorkspaceRail({
  onNavigate,
  footer,
  className,
  topOffsetClassName = "top-[calc(var(--app-topbar-offset)+4.5rem)]",
}: {
  onNavigate: (id: WorkspaceSectionId) => void;
  /** Slot inferior (p. ej. botón Convertir en multi-instalación). */
  footer?: ReactNode;
  className?: string;
  topOffsetClassName?: string;
}) {
  const [activeId, setActiveId] = useState<WorkspaceSectionId | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id as WorkspaceSectionId);
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const section of WORKSPACE_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Secciones de la cotización"
      className={cn("sticky self-start space-y-0.5", topOffsetClassName, className)}
    >
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onNavigate(section.id)}
          className={cn(
            "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
            activeId === section.id
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
        >
          {section.label}
        </button>
      ))}
      {footer && <div className="pt-2">{footer}</div>}
    </nav>
  );
}
