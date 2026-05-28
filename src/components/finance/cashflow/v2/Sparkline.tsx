"use client";

import { useId } from "react";
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

/**
 * Mini-gráfica SVG (sin librería) de los cierres proyectados alrededor de la
 * semana actual. Punto azul = semana actual, rojo = saldo negativo, verde = ok.
 * Línea punteada en y=0. Si onJump está definido, los puntos saltan a esa
 * semana. Ancho responsive (100% del contenedor).
 */
export function Sparkline({ points, onJump, height = 64 }: Props) {
  const gradientId = useId();
  if (points.length < 2) return null;

  const PAD_X = 12;
  const PAD_Y = 16;
  const W = 1000; // viewBox width; el SVG escala al 100% del contenedor
  const H = height;
  const values = points.map((p) => p.balanceClp);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;

  const x = (i: number) =>
    PAD_X + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD_Y + innerH - ((v - min) / span) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balanceClp).toFixed(1)}`)
    .join(" ");
  const zeroY = y(0);

  return (
    <div className="rounded-ds-lg border border-ds-border-default bg-ds-surface-1 px-2 py-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Proyección de saldos de las próximas semanas"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.12" />
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
        <path d={linePath} fill="none" stroke="var(--ds-text-2)" strokeWidth={1.5} />
        {/* Puntos */}
        {points.map((p, i) => {
          const color = p.isCurrent
            ? "var(--primary)"
            : p.balanceClp < 0
              ? "var(--ds-danger)"
              : "var(--ds-ok)";
          const cx = x(i);
          const cy = y(p.balanceClp);
          return (
            <g key={p.key}>
              <circle cx={cx} cy={cy} r={5.5} fill="var(--ds-surface-1)" />
              <circle
                cx={cx}
                cy={cy}
                r={p.isCurrent ? 4.5 : 3.5}
                fill={color}
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
