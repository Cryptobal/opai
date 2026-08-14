"use client";

/**
 * Rail izquierdo de secciones del workspace (desktop). Navega con scroll a la
 * sección y la expande; marca la sección activa con IntersectionObserver.
 * Se puede contraer a solo iconos para ganar espacio de edición.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileStack,
  Layers,
  LineChart,
  ListPlus,
  Percent,
  ScrollText,
  Settings2,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from "./types";

const SECTION_ICONS: Record<WorkspaceSectionId, LucideIcon> = {
  "sec-datos": ClipboardList,
  "sec-condiciones": Settings2,
  "sec-desglose": Layers,
  "sec-puestos": Users,
  "sec-costos": Wallet,
  "sec-lineas": ListPlus,
  "sec-financieros": LineChart,
  "sec-margen": Percent,
  "sec-propuesta": Sparkles,
  "sec-incluye": FileStack,
  "sec-auditoria": ScrollText,
};

export function WorkspaceRail({
  onNavigate,
  footer,
  className,
  topOffsetClassName = "top-[calc(var(--app-topbar-offset)+4.5rem)]",
  collapsed = false,
  onCollapsedChange,
}: {
  onNavigate: (id: WorkspaceSectionId) => void;
  /** Slot inferior (p. ej. botón Convertir en multi-instalación). */
  footer?: ReactNode;
  className?: string;
  topOffsetClassName?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
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
      data-collapsed={collapsed ? "true" : "false"}
      className={cn("sticky self-start space-y-0.5", topOffsetClassName, className)}
    >
      {onCollapsedChange ? (
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir secciones" : "Contraer secciones"}
          title={collapsed ? "Expandir secciones" : "Contraer secciones"}
          className={cn(
            "mb-1 flex h-10 w-full items-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground sm:h-9",
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-2.5",
          )}
        >
          {!collapsed ? (
            <span className="text-[12px] font-semibold uppercase tracking-wide">
              Secciones
            </span>
          ) : null}
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>
      ) : null}

      {WORKSPACE_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const active = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onNavigate(section.id)}
            title={section.label}
            aria-label={section.label}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex w-full items-center rounded-md text-left text-[13px] transition-colors",
              collapsed
                ? "h-10 justify-center px-0 sm:h-9"
                : "gap-2 px-2.5 py-1.5",
              active
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed ? <span className="truncate">{section.label}</span> : null}
          </button>
        );
      })}
      {footer && !collapsed ? <div className="pt-2">{footer}</div> : null}
    </nav>
  );
}
