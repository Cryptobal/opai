import { cn } from "@/lib/utils";

export type StatusKind = "ok" | "warn" | "danger" | "info" | "neutral";

const COLOR: Record<StatusKind, string> = {
  ok:      "bg-status-ok",
  warn:    "bg-status-warn",
  danger:  "bg-status-danger",
  info:    "bg-status-info",
  neutral: "bg-ds-text-4",
};

const RING: Record<StatusKind, string> = {
  ok:      "shadow-[0_0_0_4px_hsl(var(--ds-ok)/0.15)]",
  warn:    "shadow-[0_0_0_4px_hsl(var(--ds-warn)/0.15)]",
  danger:  "shadow-[0_0_0_4px_hsl(var(--ds-danger)/0.15)]",
  info:    "shadow-[0_0_0_4px_hsl(var(--ds-info)/0.15)]",
  neutral: "",
};

export interface StatusDotProps {
  kind: StatusKind;
  pulse?: boolean;
  /** Halo difuso alrededor (solo cuando se quiere llamar la atención). */
  glow?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusDot({
  kind,
  pulse = false,
  glow = false,
  size = "sm",
  className,
}: StatusDotProps) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-full shrink-0",
        dim,
        COLOR[kind],
        glow && RING[kind],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}
