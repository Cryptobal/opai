"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fmtCLP } from "./format";

export interface SparkPoint {
  key: string;
  label: string;
  balanceClp: number;
  isCurrent: boolean;
  isDeficit: boolean;
}

interface Props {
  points: SparkPoint[];
  onJump?: (key: string) => void;
  height?: number;
}

/** Mini-gráfica SVG responsive (sin librería) de los cierres proyectados.
 *  Mide el ancho real del contenedor con ResizeObserver y usa coordenadas
 *  reales para que los círculos NO se deformen en elipses. */
export function Sparkline({ points, onJump, height = 64 }: Props) {
  const gradientId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 400;
      if (w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return <div ref={containerRef} style={{ height }} />;

  const PAD_X = 12;
  const PAD_Y = 14;
  const W = width;
  const H = height;
  const values = points.map((p) => p.balanceClp);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const innerW = Math.max(W - PAD_X * 2, 1);
  const innerH = H - PAD_Y * 2;

  const x = (i: number) =>
    PAD_X + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD_Y + innerH - ((v - min) / span) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balanceClp).toFixed(1)}`)
    .join(" ");
  const zeroY = y(0);

  return (
    <div
      ref={containerRef}
      className="rounded-ds-lg border border-ds-border-default bg-ds-surface-1 px-2 py-1.5"
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Proyección de saldos de las próximas semanas"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Área bajo la línea */}
        <path
          d={`${linePath} L ${x(points.length - 1).toFixed(1)} ${(H - PAD_Y).toFixed(
            1,
          )} L ${x(0).toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`}
          fill={`url(#${gradientId})`}
        />
        {/* Línea base en y=0 */}
        <line
          x1={PAD_X}
          y1={zeroY}
          x2={W - PAD_X}
          y2={zeroY}
          stroke="var(--ds-border-strong)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {/* Línea de saldos */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--ds-text-2)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Puntos */}
        {points.map((p, i) => {
          const color = p.isCurrent
            ? "var(--primary)"
            : p.balanceClp < 0
              ? "var(--ds-danger)"
              : "var(--ds-ok)";
          const cx = x(i);
          const cy = y(p.balanceClp);
          const r = p.isCurrent ? 4.5 : 3.5;
          return (
            <g key={p.key}>
              <circle cx={cx} cy={cy} r={r + 1.5} fill="var(--ds-surface-1)" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                stroke={p.isCurrent ? "#fff" : "none"}
                strokeWidth={p.isCurrent ? 1.5 : 0}
                style={onJump ? { cursor: "pointer" } : undefined}
                onClick={onJump ? () => onJump(p.key) : undefined}
              >
                <title>{`${p.label}: ${fmtCLP.format(p.balanceClp)}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
