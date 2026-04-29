import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TagVariant =
  | "neutral"
  | "ok"
  | "warn"
  | "danger"
  | "info"
  | "brand";

const VARIANT: Record<TagVariant, string> = {
  neutral: "bg-ds-surface-2 border-ds-border-default text-ds-text-2",
  ok:      "bg-status-ok-soft border-status-ok-border text-status-ok-fg",
  warn:    "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
  danger:  "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
  info:    "bg-status-info-soft border-status-info-border text-status-info-fg",
  brand:   "bg-primary/10 border-primary/30 text-primary",
};

const SIZE = {
  sm: "h-5 px-2 text-[11px]",
  md: "h-6 px-2.5 text-[12px]",
  lg: "h-7 px-3 text-[13px]",
};

export interface TagProps {
  variant?: TagVariant;
  size?: keyof typeof SIZE;
  /** Ícono pequeño a la izquierda. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Punto de status a la izquierda (overrides icon). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Tag({
  variant = "neutral",
  size = "md",
  icon: Icon,
  dot = false,
  children,
  className,
}: TagProps) {
  const dotColor =
    variant === "ok" ? "bg-status-ok" :
    variant === "warn" ? "bg-status-warn" :
    variant === "danger" ? "bg-status-danger" :
    variant === "info" ? "bg-status-info" :
    variant === "brand" ? "bg-primary" :
    "bg-ds-text-4";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />}
      {!dot && Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}
