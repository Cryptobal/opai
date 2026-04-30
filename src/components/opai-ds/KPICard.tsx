"use client";

/**
 * OPAI DS v3 — KPICard
 *
 * Variante "Refined Industrial" del KPI: layout vertical con IconTile
 * prominente arriba y valor display grande. Diferente del componente
 * `Stat` (que tiene icon top-right y un acento lateral) — KPICard pone
 * el icono **arriba** como un anclaje visual fuerte, ideal para
 * dashboards landing donde el usuario escanea de izquierda a derecha.
 *
 * Layout:
 *   ┌───────────────────────────────────┐
 *   │  [IconTile tone]                  │
 *   │                                   │
 *   │  Stock total                      │
 *   │  12,847   ↑ 4.2%                  │
 *   │  unidades en bodega               │
 *   └───────────────────────────────────┘
 *
 * Si se necesita la variante con accent lateral y icon top-right,
 * usar Stat. Ambos coexisten — son decisiones visuales distintas.
 */

import { ReactNode, type ReactElement, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Surface } from "./Surface";
import { IconTile, type IconBubbleVariant, type IconBubbleTone } from "./IconBubble";

export type KPIVariant = "default" | "ok" | "warn" | "danger" | "brand";

const VARIANT_VALUE_COLOR: Record<KPIVariant, string> = {
  default: "text-ds-text-1",
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  brand:   "text-primary",
};

export interface KPICardProps {
  /** Etiqueta superior (uppercase eyebrow). */
  label: string;
  /** Valor principal. Puede ser number (animable) o ReactNode. */
  value: ReactNode;
  /** Texto descriptivo debajo del valor. */
  hint?: ReactNode;
  /** Variant semántico: solo afecta el color del valor. */
  variant?: KPIVariant;
  /**
   * Ícono para el IconTile arriba. Acepta el componente Lucide o el
   * elemento ya renderizado (`<Icon />`). Server Components DEBEN pasar
   * el elemento renderizado (los lucide icons son `forwardRef` y no
   * cruzan la frontera Server → Client como prop).
   */
  icon?: LucideIcon | ReactElement;
  /** Variant semántica del IconTile. Default "brand". Ignorada si `iconTone` está definido. */
  iconVariant?: IconBubbleVariant;
  /** Tono categórico del IconTile (preferir para módulos con identidad). */
  iconTone?: IconBubbleTone;
  /** Tendencia: número en %. + up, - down, 0 flat. Pinta arrow + color semántico. */
  trend?: number;
  /** Si el trend "subir" es malo (ej: cantidad de errores), invierte el color. */
  trendInverted?: boolean;
  /** Animación count-up (solo si value es number). */
  animate?: boolean;
  /** Si se pasa, la card es clickable. */
  onClick?: () => void;
  className?: string;
}

function useCountUp(target: number, enabled: boolean, duration = 800) {
  const [v, setV] = useState(enabled ? 0 : target);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setV(target);
      return;
    }
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration]);

  return v;
}

export function KPICard({
  label,
  value,
  hint,
  variant = "default",
  icon,
  iconVariant = "brand",
  iconTone,
  trend,
  trendInverted = false,
  animate = false,
  onClick,
  className,
}: KPICardProps) {
  const numericValue = typeof value === "number" ? value : null;
  const animated = useCountUp(numericValue ?? 0, animate && numericValue != null);
  const displayed =
    numericValue != null && animate
      ? animated.toLocaleString("es-CL")
      : numericValue != null
        ? numericValue.toLocaleString("es-CL")
        : value;

  const TrendIcon =
    trend == null ? null : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const isPositive = trend != null && (trendInverted ? trend < 0 : trend > 0);
  const isNegative = trend != null && (trendInverted ? trend > 0 : trend < 0);
  const trendColor =
    trend == null
      ? ""
      : isPositive
        ? "text-status-ok-fg"
        : isNegative
          ? "text-status-danger-fg"
          : "text-ds-text-3";

  return (
    <Surface
      elevation={1}
      padding="none"
      hoverable={!!onClick}
      tappable={!!onClick}
      onClick={onClick}
      className={cn("p-4 sm:p-5", className)}
    >
      {icon && (
        <IconTile
          icon={icon}
          variant={iconVariant}
          tone={iconTone}
          size="md"
          className="mb-3"
        />
      )}

      <p className="text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4">
        {label}
      </p>

      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "font-mono font-semibold tabular-nums tracking-tight leading-none",
            "text-2xl sm:text-3xl",
            VARIANT_VALUE_COLOR[variant],
          )}
        >
          {displayed}
        </span>
        {TrendIcon && (
          <span className={cn("flex items-center gap-0.5 text-xs font-mono tabular-nums", trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend!).toFixed(1)}%
          </span>
        )}
      </div>

      {hint && (
        <p className="mt-1.5 text-xs text-ds-text-3 leading-snug">
          {hint}
        </p>
      )}
    </Surface>
  );
}

export interface KPIGridProps {
  children: ReactNode;
  cols?: 1 | 2;
  lgCols?: 2 | 3 | 4;
  className?: string;
}

export function KPIGrid({ children, cols = 2, lgCols = 4, className }: KPIGridProps) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4",
        cols === 1 ? "grid-cols-1" : "grid-cols-2",
        lgCols === 2 ? "lg:grid-cols-2" : lgCols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
