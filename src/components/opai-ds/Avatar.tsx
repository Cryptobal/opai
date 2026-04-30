import { cn } from "@/lib/utils";

export type AvatarVariant = "default" | "ok" | "warn" | "danger" | "brand" | "neutral";

export interface AvatarProps {
  /** Iniciales (típicamente 2 letras). Se renderean uppercase. */
  initials: string;
  variant?: AvatarVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const VARIANT_BG: Record<AvatarVariant, string> = {
  default: "bg-gradient-to-br from-ds-text-1/15 to-ds-text-1/5 text-ds-text-1",
  ok:      "bg-gradient-to-br from-status-ok to-status-ok/70 text-white",
  warn:    "bg-gradient-to-br from-status-warn to-status-warn/70 text-white",
  danger:  "bg-gradient-to-br from-status-danger to-status-danger/70 text-white",
  brand:   "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
  neutral: "bg-ds-surface-3 border border-dashed border-ds-border-default text-ds-text-3",
};

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[11px]",
  lg: "h-11 w-11 text-[13px]",
};

export function Avatar({ initials, variant = "default", size = "md", className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none ds-ring-inset",
        VARIANT_BG[variant],
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {initials.toUpperCase().slice(0, 2)}
    </span>
  );
}
