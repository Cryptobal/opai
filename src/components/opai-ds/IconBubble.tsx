"use client";

/**
 * OPAI DS v3 — IconBubble
 *
 * Wrapper estandarizado para íconos de Lucide. Resuelve el feedback
 * de Carlos: "los íconos deben tener un diseño impresionante, moderno,
 * minimalista, no plano de colores tampoco arcoíris".
 *
 * Composición visual:
 *   - Contenedor cuadrado redondeado (rounded-ds-md o rounded-full según prop).
 *   - Background: gradient sutil from-{variant}/15 to-{variant}/5.
 *   - Inset ring: 1px de --ds-text-1/0.06 (light) o white/6 (dark).
 *   - Sombra externa: shadow-ds-xs.
 *   - Ícono Lucide centrado con color {variant}.
 *
 * Variantes semánticas — NO arcoíris: solo se usan donde *aporta* significado.
 *   - brand: el principal, para el módulo "Inventario" y CTAs primarias.
 *   - neutral: para acciones secundarias / metadata.
 *   - ok / warn / danger / info: para estado real.
 */

import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

export type IconBubbleVariant = "brand" | "neutral" | "ok" | "warn" | "danger" | "info";
export type IconBubbleSize = "sm" | "md" | "lg" | "xl";

const VARIANT_BG: Record<IconBubbleVariant, string> = {
  brand:   "bg-gradient-to-br from-primary/20 to-primary/5",
  neutral: "bg-gradient-to-br from-ds-text-1/[0.08] to-ds-text-1/[0.02]",
  ok:      "bg-gradient-to-br from-status-ok/20 to-status-ok/5",
  warn:    "bg-gradient-to-br from-status-warn/20 to-status-warn/5",
  danger:  "bg-gradient-to-br from-status-danger/20 to-status-danger/5",
  info:    "bg-gradient-to-br from-status-info/20 to-status-info/5",
};

const VARIANT_FG: Record<IconBubbleVariant, string> = {
  brand:   "text-primary",
  neutral: "text-ds-text-2",
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  info:    "text-status-info-fg",
};

const SIZE_BOX: Record<IconBubbleSize, string> = {
  sm: "h-8 w-8",       // 32px — list items dense
  md: "h-10 w-10",     // 40px — list items default
  lg: "h-12 w-12",     // 48px — empty states / dialog headers
  xl: "h-16 w-16",     // 64px — empty states grandes / hero
};

const SIZE_ICON: Record<IconBubbleSize, string> = {
  sm: "h-4 w-4",
  md: "h-[18px] w-[18px]",
  lg: "h-5 w-5",
  xl: "h-7 w-7",
};

export interface IconBubbleProps {
  icon: LucideIcon;
  variant?: IconBubbleVariant;
  size?: IconBubbleSize;
  /** Forma circular en vez de redondeada. */
  rounded?: "square" | "circle";
  className?: string;
}

export function IconBubble({
  icon: Icon,
  variant = "neutral",
  size = "md",
  rounded = "square",
  className,
}: IconBubbleProps) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center shrink-0",
        "ds-ring-inset shadow-ds-xs",
        rounded === "circle" ? "rounded-full" : "rounded-ds-md",
        SIZE_BOX[size],
        VARIANT_BG[variant],
        className,
      )}
    >
      <Icon className={cn(SIZE_ICON[size], VARIANT_FG[variant])} strokeWidth={1.75} />
    </span>
  );
}
