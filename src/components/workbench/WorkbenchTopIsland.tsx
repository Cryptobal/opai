"use client";

/**
 * WorkbenchTopIsland — isla superior flotante glass (móvil/tablet `<lg`).
 * Cierra el pendiente documentado en LIQUID-GLASS-PENDIENTES.md para fichas
 * del workbench comercial (no sustituye el header ERP global).
 */

import type { ReactNode } from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkbenchTopIsland({
  eyebrow,
  title,
  onBack,
  trailing,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  onBack?: () => void;
  /** Acciones der. (search, more…). Default: botón ⋮ vacío si no se pasa. */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-40 lg:hidden",
        className,
      )}
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <div
        className={cn(
          "pointer-events-auto mx-2.5 flex h-[52px] items-center gap-2 rounded-[26px] px-2",
          "opai-glass-strong opai-glass-shell border border-[var(--glass-border)]",
        )}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--glass-fill-soft)] text-ds-text-2 shadow-[var(--glass-specular)] transition active:scale-95"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <span className="h-[38px] w-[38px] shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 text-center">
          <i className="block text-[12px] font-bold not-italic uppercase tracking-[0.16em] text-ds-text-3">
            {eyebrow}
          </i>
          <b className="block truncate text-[14px] font-semibold text-ds-text-1">
            {title}
          </b>
        </div>
        {trailing ?? (
          <span
            className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--glass-fill-soft)] text-ds-text-2 opacity-0"
            aria-hidden
          >
            <MoreVertical className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
    </div>
  );
}

/** Botón circular glass para acciones de isla (back, more, search). */
export function WorkbenchIslandIconButton({
  onClick,
  label,
  children,
  className,
}: {
  onClick?: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full",
        "border border-white/[0.08] bg-[var(--glass-fill-soft)] text-ds-text-2",
        "shadow-[var(--glass-specular)] transition hover:bg-white/[0.09] hover:text-ds-text-1 active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}
