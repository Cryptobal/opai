"use client";

/**
 * OPAI DS v3 — IconBubble (alias: IconTile)
 *
 * Wrapper estandarizado para íconos de Lucide. Resuelve el feedback
 * original: "los íconos deben tener un diseño impresionante, moderno,
 * minimalista, no plano de colores tampoco arcoíris".
 *
 * Composición visual:
 *   - Contenedor cuadrado redondeado (rounded-ds-md o rounded-full según prop).
 *   - Background: gradient sutil from-{variant}/15 to-{variant}/5
 *     o tinte sólido categórico (cuando se usa `tone`).
 *   - Sombra externa: shadow-ds-xs.
 *   - Ícono Lucide centrado, strokeWidth 1.75.
 *
 * Dos modos visuales mutuamente excluyentes:
 *
 * 1. SEMÁNTICO (`variant`, default) — NO arcoíris: variantes solo donde
 *    *aporta* significado.
 *    - brand: el principal, para módulos y CTAs primarias.
 *    - neutral: para acciones secundarias / metadata.
 *    - ok / warn / danger / info: para estado real.
 *
 * 2. CATEGÓRICO (`tone`) — para agrupar visualmente categorías sin
 *    significado de estado (ej: tipos de movimiento de inventario,
 *    secciones de un módulo). Render plano y sólido sobre tint-*.
 *    Usar con disciplina: máximo 2-3 tonos por superficie. NO mezclar
 *    con variant (tone gana si ambos están).
 */

import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";
import { type Tone, toneClasses } from "@/lib/design-system/tokens";

export type IconBubbleVariant = "brand" | "neutral" | "ok" | "warn" | "danger" | "info";
export type IconBubbleSize = "sm" | "md" | "lg" | "xl";
export type IconBubbleTone = Tone;

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
  /** Variante semántica (estados / brand / neutral). Ignorada si `tone` está definido. */
  variant?: IconBubbleVariant;
  /** Tono categórico (no semántico). Tiene precedencia sobre `variant`. */
  tone?: IconBubbleTone;
  size?: IconBubbleSize;
  /** Forma circular en vez de redondeada. */
  rounded?: "square" | "circle";
  className?: string;
}

export function IconBubble({
  icon: Icon,
  variant = "neutral",
  tone,
  size = "md",
  rounded = "square",
  className,
}: IconBubbleProps) {
  const useTone = tone !== undefined;
  const containerColor = useTone ? toneClasses(tone) : VARIANT_BG[variant];
  const iconColor = useTone ? "" : VARIANT_FG[variant];

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center shrink-0",
        "ds-ring-inset shadow-ds-xs",
        rounded === "circle" ? "rounded-full" : "rounded-ds-md",
        SIZE_BOX[size],
        containerColor,
        className,
      )}
    >
      <Icon className={cn(SIZE_ICON[size], iconColor)} strokeWidth={1.75} />
    </span>
  );
}

/**
 * Alias semántico de IconBubble. Preferir este nombre en código nuevo
 * cuando se use con `tone` (categórico). Misma API.
 */
export const IconTile = IconBubble;
export type IconTileProps = IconBubbleProps;
export type IconTileTone = IconBubbleTone;
export type IconTileSize = IconBubbleSize;
