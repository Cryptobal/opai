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
  "flex w-full items-center justify-between gap-2.5 min-h-[52px] border-b border-white/[0.07] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]";

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
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(20,168,138,0.10)] text-[var(--ds-glow)] shadow-[inset_0_0_0_1px_rgba(var(--ds-glow-rgb),0.20)]">
            {icon}
          </span>
        ) : null}
        <h2 className="shrink-0 text-[13.5px] font-semibold tracking-tight text-ds-text-1">
          {title}
        </h2>
        {!open && summary}
        {headerExtra}
      </div>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-ds-text-3 transition-transform",
          open && "rotate-180",
        )}
      />
    </>
  );

  return (
    <Card
      id={id}
      className={cn(
        "overflow-hidden rounded-[18px] border-[var(--glass-border)] bg-[var(--glass-fill)] shadow-[var(--glass-specular),0_8px_30px_rgba(0,0,0,0.30)]",
        cardClassName,
      )}
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
