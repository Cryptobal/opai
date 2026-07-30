"use client";

/**
 * Shell colapsable estándar del workspace de cotización: Card + header con
 * título/resumen + chevron. Réplica exacta del patrón de sección de
 * CpqQuoteDetail para mantener paridad visual en única y multi-instalación.
 */

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const HEADER_CLASS =
  "flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors";

export function SectionCard({
  id,
  title,
  icon,
  summary,
  headerExtra,
  open,
  onToggle,
  cardClassName,
  bodyClassName,
  bodyInert,
  headerAs = "button",
  children,
}: {
  /** Ancla para navegación por chips/rail (scroll a sección). */
  id?: string;
  title: string;
  icon?: ReactNode;
  /** Resumen compacto visible solo con la sección plegada. */
  summary?: ReactNode;
  /** Nodo extra del header visible siempre (p. ej. "Guardando…"). */
  headerExtra?: ReactNode;
  open: boolean;
  onToggle: () => void;
  cardClassName?: string;
  bodyClassName?: string;
  bodyInert?: boolean;
  headerAs?: "button" | "div";
  children?: ReactNode;
}) {
  const headerContent = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h2 className="text-sm font-semibold text-primary shrink-0">{title}</h2>
        {!open && summary}
        {headerExtra}
      </div>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform shrink-0",
          open && "rotate-180",
        )}
      />
    </>
  );

  return (
    <Card
      id={id}
      className={cn("rounded-xl border-border/70 bg-card/85 shadow-sm", cardClassName)}
    >
      {headerAs === "div" ? (
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          className={cn(HEADER_CLASS, "cursor-pointer")}
        >
          {headerContent}
        </div>
      ) : (
        <button type="button" onClick={onToggle} className={HEADER_CLASS}>
          {headerContent}
        </button>
      )}
      {open && (
        <div
          className={
            bodyClassName ?? "px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4"
          }
          inert={bodyInert ? true : undefined}
        >
          {children}
        </div>
      )}
    </Card>
  );
}
