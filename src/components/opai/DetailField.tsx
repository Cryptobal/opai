"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DetailFieldDisplayProps {
  label: string;
  value?: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  copyable?: boolean;
  boxed?: boolean;
  /** Affordance extra a la derecha del valor (lápiz, candado, spinner). */
  trailing?: ReactNode;
  /** Contenedor interactivo (botón) — props de accesibilidad. */
  interactive?: {
    onClick?: () => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    tabIndex?: number;
    "aria-label"?: string;
    role?: string;
  };
  /** Barra de acento izquierda (hover/edit). */
  accent?: boolean;
  /** Estado visual de guardado. */
  statusHint?: ReactNode;
}

/**
 * Markup de lectura compartido por DetailField e InlineEditField.
 * No duplicar este markup en callers.
 */
export function DetailFieldDisplay({
  label,
  value,
  icon,
  fullWidth = false,
  placeholder = "—",
  className,
  mono = false,
  copyable = false,
  boxed = false,
  trailing,
  interactive,
  accent = false,
  statusHint,
}: DetailFieldDisplayProps) {
  const isEmpty =
    value === null || value === undefined || value === "" || value === 0;

  const handleCopy = () => {
    if (!copyable || isEmpty || typeof value !== "string") return;
    navigator.clipboard.writeText(value).catch(() => {});
  };

  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={cn(
        "min-w-0 relative text-left w-full",
        fullWidth && "sm:col-span-2",
        boxed &&
          "rounded-xl border border-ds-border-default/60 bg-ds-surface-1/40 p-3 sm:p-4 transition-colors hover:bg-ds-surface-1/60",
        accent &&
          "pl-3 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:rounded-full before:bg-primary",
        interactive &&
          "min-h-11 sm:min-h-0 rounded-md -mx-1 px-1 py-0.5 hover:bg-ds-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className
      )}
      onClick={interactive?.onClick ?? (copyable ? handleCopy : undefined)}
      onKeyDown={interactive?.onKeyDown}
      tabIndex={interactive?.tabIndex}
      aria-label={interactive?.["aria-label"]}
      role={interactive?.role}
      title={
        !interactive && copyable && typeof value === "string"
          ? "Clic para copiar"
          : undefined
      }
    >
      <dt
        className={cn(
          "break-words flex items-center gap-1.5",
          boxed
            ? "mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3"
            : "text-xs font-medium text-ds-text-3 mb-0.5 uppercase tracking-wide"
        )}
      >
        <span>{label}</span>
        {statusHint}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words",
          boxed ? "text-[13px] font-medium text-foreground" : "text-sm text-foreground",
          mono && "font-mono tabular-nums",
          copyable && !isEmpty && !interactive && "cursor-copy hover:text-primary transition-colors",
          isEmpty && "text-ds-text-4"
        )}
      >
        <span className="flex items-start gap-1.5 min-w-0">
          {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
          <span className="min-w-0 break-words flex-1">
            {isEmpty ? placeholder : value}
          </span>
          {trailing && <span className="shrink-0 mt-0.5">{trailing}</span>}
        </span>
      </dd>
    </Tag>
  );
}

interface DetailFieldProps {
  label: string;
  value?: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  copyable?: boolean;
  boxed?: boolean;
}

/**
 * DetailField — Campo label:valor estandarizado para vistas de detalle (solo lectura).
 */
export function DetailField(props: DetailFieldProps) {
  return <DetailFieldDisplay {...props} />;
}

interface DetailFieldGridProps {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3;
  boxed?: boolean;
}

export function DetailFieldGrid({
  children,
  className,
  columns = 2,
  boxed = false,
}: DetailFieldGridProps) {
  return (
    <dl
      className={cn(
        "grid min-w-0",
        boxed ? "gap-2 sm:gap-3" : "gap-x-6 gap-y-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </dl>
  );
}
