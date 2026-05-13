"use client";

/**
 * MobileFAB — botón flotante (Floating Action Button) para la acción
 * primaria del módulo en celular.
 *
 * Se posiciona fixed bottom-right respetando safe-area (iOS). Solo
 * visible bajo md (`md:hidden`). En desktop la acción primaria vive
 * en el header del módulo.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onClick: () => void;
  /** Icono lucide (h-5 w-5). */
  icon: ReactNode;
  /** Label accesible obligatorio. */
  label: string;
  /** Si true, también muestra el label visualmente al lado del icono. */
  extended?: boolean;
  /** Variante de color. */
  tone?: "primary" | "neutral";
  className?: string;
  disabled?: boolean;
}

export function MobileFAB({
  onClick,
  icon,
  label,
  extended = false,
  tone = "primary",
  className,
  disabled = false,
}: Props) {
  const toneCls =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : "bg-ds-surface-1 text-ds-text-1 border border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "md:hidden fixed right-4 z-30 inline-flex items-center justify-center gap-2 rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        extended ? "h-14 px-5" : "h-14 w-14",
        toneCls,
        className,
      )}
      style={{
        bottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {icon}
      </span>
      {extended ? (
        <span className="text-[14px] font-semibold whitespace-nowrap">
          {label}
        </span>
      ) : null}
    </button>
  );
}
