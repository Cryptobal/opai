/**
 * CrmKpiSparkline — sparkline SVG inline para KPIs del dashboard CRM.
 *
 * Server-safe (sin estado ni librerías): polyline + área con `currentColor`,
 * coloreada por el wrapper vía tokens semánticos. Aditivo al slot `footer`
 * de `Stat`.
 */

import { cn } from "@/lib/utils";

const VARIANT_COLOR: Record<string, string> = {
  default: "text-ds-text-3",
  ok: "text-status-ok-fg",
  warn: "text-status-warn-fg",
  danger: "text-status-danger-fg",
  brand: "text-primary",
};

export function CrmKpiSparkline({
  points,
  variant = "brand",
  className,
}: {
  points: number[];
  variant?: keyof typeof VARIANT_COLOR;
  className?: string;
}) {
  if (points.length < 2) return null;

  const W = 100;
  const H = 28;
  const PAD = 2;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = (W - PAD * 2) / (points.length - 1);
  const coords = points.map((v, i) => {
    const x = PAD + i * step;
    const y = PAD + (H - PAD * 2) * (1 - (v - min) / range);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <span className={cn("block", VARIANT_COLOR[variant] ?? VARIANT_COLOR.brand, className)} aria-hidden>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-7 w-full"
        role="presentation"
      >
        <polygon points={area} fill="currentColor" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
