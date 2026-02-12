"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CRM_SECTIONS, type CrmSectionKey } from "./CrmModuleIcons";

/* ── Types ── */

export interface SectionNavItem {
  key: CrmSectionKey;
  /** Override label (por defecto usa el del mapeo central) */
  label?: string;
  /** Conteo a mostrar como badge (ej: "3" contactos) */
  count?: number;
}

interface CrmSectionNavProps {
  /** Secciones a mostrar en la nav */
  sections: SectionNavItem[];
  /** Clases CSS adicionales */
  className?: string;
}

/**
 * CrmSectionNav — Tabs de anclas con scroll suave + resaltado por intersection observer.
 *
 * Patrón nivel HubSpot: tabs horizontales sticky debajo del RecordHeader que permiten
 * saltar a cada sección de la página de detalle. El tab activo se resalta automáticamente
 * según qué sección es visible en el viewport.
 *
 * Cada sección en la página debe tener un id="section-{key}" para que las anclas funcionen.
 */
export function CrmSectionNav({ sections, className }: CrmSectionNavProps) {
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.key || ""
  );
  const navRef = useRef<HTMLDivElement>(null);
  const isClickScrolling = useRef(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Intersection Observer para detectar la sección visible
  useEffect(() => {
    const sectionIds = sections.map((s) => `section-${s.key}`);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // No actualizar si estamos haciendo scroll por clic
        if (isClickScrolling.current) return;

        // Encontrar la sección más visible
        let maxRatio = 0;
        let maxKey = activeSection;

        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxKey = entry.target.id.replace("section-", "");
          }
        }

        // Si ninguna tiene ratio alto, usar la primera visible
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

  // Scroll suave al hacer clic en un tab
  const handleClick = useCallback(
    (key: string) => {
      const el = document.getElementById(`section-${key}`);
      if (!el) return;

      // Marcar como scroll por clic para evitar flicker del observer
      isClickScrolling.current = true;
      setActiveSection(key);

      el.scrollIntoView({ behavior: "smooth", block: "start" });

      // Esperar a que termine el scroll antes de re-activar el observer
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 800);
    },
    []
  );

  // Scroll el tab activo al centro del nav (para móvil)
  useEffect(() => {
    if (!navRef.current) return;
    const activeEl = navRef.current.querySelector(
      `[data-section="${activeSection}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeSection]);

  if (sections.length <= 1) return null;

  return (
    <div
      className={cn(
        "sticky top-[73px] lg:top-[113px] z-[9] -mx-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "sm:-mx-6 lg:-mx-8 xl:-mx-10 2xl:-mx-12",
        className
      )}
    >
      <div
        ref={navRef}
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12"
        role="tablist"
        aria-label="Secciones del registro"
      >
        {sections.map((section) => {
          const config = CRM_SECTIONS[section.key];
          const Icon = config.icon;
          const label = section.label || config.label;
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
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
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
              {/* Indicador activo */}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
