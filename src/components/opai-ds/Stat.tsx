"use client";

/**
 * OPAI DS v3 — Stat (KPI card)
 *
 * Reemplaza a KpiCard de conocimiento y a los OpaiSurface variant="tight"
 * que se usan como KPIs en inventario.
 *
 * Características:
 *  - Touch target real (~64px alto en mobile, 80px desktop).
 *  - Tipografía display para el valor (Outfit Variable bold).
 *  - Variant semántico (default / ok / warn / danger / brand) que solo
 *    afecta el color del valor — el contenedor sigue siendo neutro
 *    (no es arcoíris).
 *  - Soporta count-up animation opcional.
 *  - Trend opcional (delta + flecha).
 */

import { ReactNode, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Surface } from "./Surface";

type StatVariant = "default" | "ok" | "warn" | "danger" | "brand";

const VARIANT_VALUE_COLOR: Record<StatVariant, string> = {
  default: "text-ds-text-1",
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  brand:   "text-primary",
};

const VARIANT_ACCENT: Record<StatVariant, string> = {
  default: "",
  ok:      "before:bg-status-ok",
  warn:    "before:bg-status-warn",
  danger:  "before:bg-status-danger",
  brand:   "before:bg-primary",
};

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Texto secundario, metadata. */
  hint?: ReactNode;
  variant?: StatVariant;
  /** Ícono Lucide (componente, no instancia). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Tendencia: número entre -100 y 100. + es up, - es down, 0 es flat. */
  trend?: number;
  /** Animación count-up (solo si value es number). */
  animate?: boolean;
  /** Acción: si se pasa, la card se vuelve clickable y muestra → al hover. */
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

export function Stat({
  label,
  value,
  hint,
  variant = "default",
  icon: Icon,
  trend,
  animate = false,
  onClick,
  className,
}: StatProps) {
  const numericValue = typeof value === "number" ? value : null;
  const animated = useCountUp(numericValue ?? 0, animate && numericValue != null);
  const displayed = numericValue != null && animate ? animated.toLocaleString("es-CL") : value;

  const TrendIcon = trend == null ? null : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendColor =
    trend == null ? "" :
    trend > 0 ? "text-status-ok-fg" :
    trend < 0 ? "text-status-danger-fg" :
    "text-ds-text-3";

  return (
    <Surface
      elevation={1}
      padding="none"
      hoverable={!!onClick}
      tappable={!!onClick}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden p-3.5 sm:p-4 min-h-[78px] sm:min-h-[92px]",
        // Acento lateral 2px solo en variantes con color
        variant !== "default" && [
          "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r",
          VARIANT_ACCENT[variant],
        ],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
          {label}
        </span>
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-ds-text-4 shrink-0" />
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "font-display text-2xl sm:text-[28px] font-bold leading-none ds-num",
            VARIANT_VALUE_COLOR[variant],
          )}
        >
          {displayed}
        </span>
        {TrendIcon && (
          <span className={cn("flex items-center gap-0.5 text-xs ds-num", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {Math.abs(trend!)}%
          </span>
        )}
      </div>

      {hint && (
        <p className="mt-1 text-[12px] text-ds-text-3 leading-snug truncate">
          {hint}
        </p>
      )}
    </Surface>
  );
}

export interface StatGridProps {
  children: ReactNode;
  /** Columnas en mobile. Default 2. */
  cols?: 1 | 2;
  /** Columnas en lg+. Default 4. */
  lgCols?: 2 | 3 | 4;
  className?: string;
}

export function StatGrid({ children, cols = 2, lgCols = 4, className }: StatGridProps) {
  return (
    <div
      className={cn(
        "grid gap-2.5 sm:gap-3",
        cols === 1 ? "grid-cols-1" : "grid-cols-2",
        lgCols === 2 ? "lg:grid-cols-2" : lgCols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
