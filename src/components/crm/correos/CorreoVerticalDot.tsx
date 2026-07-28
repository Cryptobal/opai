"use client";

import {
  VERTICAL_META,
  type RadarVertical,
} from "@/modules/crm/email/radar-types";

type Props = {
  vertical: RadarVertical | null;
  fixed?: boolean;
  variant?: "bar" | "edge" | "dot";
};

/**
 * Indicador visual de vertical (barra / borde / punto).
 * Color del catálogo VERTICAL_META; el nombre va en title + aria-label.
 */
export function CorreoVerticalDot({
  vertical,
  fixed = false,
  variant = "bar",
}: Props) {
  if (!vertical || !(vertical in VERTICAL_META)) return null;
  const meta = VERTICAL_META[vertical as Exclude<RadarVertical, "otro">];
  const label = fixed ? `${meta.label} · fijada manualmente` : meta.label;
  const fixedRing = fixed
    ? "ring-1 ring-ds-border-strong ring-offset-1 ring-offset-ds-surface-0"
    : "";

  if (variant === "edge") {
    return (
      <span
        aria-label={label}
        title={label}
        className={`w-[3px] shrink-0 self-stretch rounded-r-[2px] ${meta.dot} ${fixedRing}`}
      />
    );
  }

  if (variant === "dot") {
    return (
      <span
        aria-label={label}
        title={label}
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot} ${fixedRing}`}
      />
    );
  }

  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-block h-[18px] w-[3px] shrink-0 rounded-[2px] ${meta.dot} ${fixedRing}`}
    />
  );
}
