"use client";

/**
 * Chips horizontales de navegación de secciones (móvil): tap = expandir la
 * sección y hacer scroll hasta ella bajo las barras sticky.
 */

import { cn } from "@/lib/utils";
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from "./types";

export function SectionChips({
  onNavigate,
  className,
}: {
  onNavigate: (id: WorkspaceSectionId) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[-webkit-mask-image:linear-gradient(90deg,#000_92%,transparent)] [mask-image:linear-gradient(90deg,#000_92%,transparent)]",
        className,
      )}
      role="tablist"
      aria-label="Secciones de la cotización"
    >
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onNavigate(section.id)}
          className="h-8 shrink-0 rounded-full border border-border/60 bg-ds-surface-2/70 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-ds-surface-3"
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}
