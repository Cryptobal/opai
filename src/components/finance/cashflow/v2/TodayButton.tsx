"use client";

import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  visible: boolean;
  onClick: () => void;
  variant: "desktop-inline" | "mobile-fab";
}

/** Vuelve a la semana actual. Inline (pill) en desktop; FAB flotante en móvil.
 *  No renderiza nada si visible=false. */
export function TodayButton({ visible, onClick, variant }: Props) {
  if (!visible) return null;

  if (variant === "mobile-fab") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Volver a hoy"
        className={cn(
          "fixed bottom-5 right-5 z-30 inline-flex items-center gap-1.5 rounded-ds-pill",
          "bg-primary px-4 py-3 text-[13px] font-semibold text-primary-foreground shadow-ds-lg",
          "active:scale-95 md:hidden",
        )}
      >
        <CalendarClock className="h-4 w-4" /> Hoy
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Volver a hoy"
      className={cn(
        "hidden items-center gap-1.5 rounded-ds-pill border border-primary/40 bg-primary/10",
        "px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 md:inline-flex",
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" /> Hoy
    </button>
  );
}
