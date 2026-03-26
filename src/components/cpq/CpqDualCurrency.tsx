"use client";

/**
 * Muestra un monto en CLP siempre con conversión UF cuando hay ufValue,
 * respetando la moneda de visualización de la cotización (primaria grande, secundaria discreta).
 */

import { cn, formatCLP } from "@/lib/utils";

function fmtUfTrailing(n: number) {
  return `${n.toFixed(2)} UF`;
}

function normalizeDisplayCurrency(c: string): "UF" | "CLP" {
  const u = c.toUpperCase();
  if (u === "UF" || u === "CLF") return "UF";
  return "CLP";
}

export interface CpqDualCurrencyAmountProps {
  clp: number;
  currency: string;
  ufValue?: number | null;
  size?: "xs" | "sm" | "md" | "lg";
  isDark?: boolean;
  primaryClassName?: string;
  secondaryClassName?: string;
  className?: string;
  suffix?: string;
  align?: "left" | "right" | "center";
  /** Primaria y secundaria en una sola línea (p. ej. meta de puesto) */
  inline?: boolean;
}

const SIZE_PRIMARY: Record<NonNullable<CpqDualCurrencyAmountProps["size"]>, string> = {
  xs: "text-xs font-semibold",
  sm: "text-xs font-semibold",
  md: "text-sm font-bold",
  lg: "text-2xl font-bold",
};

const SIZE_SECONDARY: Record<NonNullable<CpqDualCurrencyAmountProps["size"]>, string> = {
  xs: "text-[9px] font-medium",
  sm: "text-xs font-medium",
  md: "text-sm font-medium",
  lg: "text-sm font-medium",
};

export function CpqDualCurrencyAmount({
  clp,
  currency,
  ufValue,
  size = "sm",
  isDark,
  primaryClassName,
  secondaryClassName,
  className,
  suffix = "",
  align = "right",
  inline = false,
}: CpqDualCurrencyAmountProps) {
  const alignCls =
    align === "right"
      ? "items-end text-right"
      : align === "center"
        ? "items-center text-center"
        : "items-start text-left";
  const norm = normalizeDisplayCurrency(currency);
  const uf = ufValue != null && Number.isFinite(Number(ufValue)) && Number(ufValue) > 0 ? Number(ufValue) : 0;
  const roundedClp = Math.round(clp);
  const clpStr = formatCLP(roundedClp) + suffix;
  const ufStr = uf > 0 ? fmtUfTrailing(roundedClp / uf) + suffix : null;

  const primaryIsUf = norm === "UF" && ufStr != null;
  const primaryText = primaryIsUf ? ufStr : clpStr;
  const secondaryText = uf > 0 ? (primaryIsUf ? clpStr : ufStr!) : null;

  const defaultSecondary = cn(
    SIZE_SECONDARY[size],
    "tabular-nums font-mono whitespace-nowrap",
    isDark ? "text-zinc-500" : "text-muted-foreground opacity-80",
    secondaryClassName,
  );

  return (
    <div
      className={cn(
        "min-w-0",
        inline
          ? "inline-flex flex-row flex-wrap items-baseline gap-x-1.5 gap-y-0"
          : cn("flex flex-col gap-0", alignCls),
        className,
      )}
    >
      <span
        className={cn(
          "tabular-nums font-mono whitespace-nowrap",
          SIZE_PRIMARY[size],
          isDark ? "text-zinc-100" : "text-foreground",
          primaryClassName,
        )}
      >
        {primaryText}
      </span>
      {secondaryText != null && <span className={defaultSecondary}>{secondaryText}</span>}
    </div>
  );
}
