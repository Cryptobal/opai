"use client";

/**
 * Chips horizontales de navegación de secciones (móvil): tap = expandir la
 * sección y hacer scroll hasta ella bajo las barras sticky.
 * Chip activo con scroll-spy; contadores opcionales; auto-centrado en el carrusel.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from "./types";

export function SectionChips({
  onNavigate,
  activeId,
  counts,
  className,
}: {
  onNavigate: (id: WorkspaceSectionId) => void;
  activeId?: WorkspaceSectionId | null;
  counts?: Partial<Record<WorkspaceSectionId, number>>;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!activeId) return;
    const scroller = scrollerRef.current;
    const chip = chipRefs.current.get(activeId);
    if (!scroller || !chip) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta =
      chipRect.left - scrollerRect.left - (scrollerRect.width / 2 - chipRect.width / 2);
    scroller.scrollBy({ left: delta, behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "flex h-10 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Solo pan horizontal: evita que el gesto diagonal/vertical mueva la
        // página o el stack sticky (mismo patrón que SwipeTabs).
        "touch-pan-x overscroll-x-contain",
        "[-webkit-mask-image:linear-gradient(90deg,#000_92%,transparent)] [mask-image:linear-gradient(90deg,#000_92%,transparent)]",
        className,
      )}
      role="tablist"
      aria-label="Secciones de la cotización"
    >
      {WORKSPACE_SECTIONS.map((section) => {
        const active = activeId === section.id;
        const count = counts?.[section.id];
        return (
          <button
            key={section.id}
            ref={(el) => {
              if (el) chipRefs.current.set(section.id, el);
              else chipRefs.current.delete(section.id);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onNavigate(section.id)}
            className={cn(
              "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] transition",
              active
                ? "border-transparent bg-[linear-gradient(180deg,var(--ds-glow),hsl(var(--primary)))] font-bold text-[var(--ds-glow-ink)] shadow-[0_4px_16px_rgba(20,168,138,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]"
                : "border-white/[0.07] bg-[var(--glass-fill-soft)] font-medium text-ds-text-3 shadow-[var(--glass-specular)] hover:text-ds-text-1 active:scale-95",
            )}
          >
            {section.label}
            {typeof count === "number" && count > 0 ? (
              <span className="font-mono text-[12px] opacity-85">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
