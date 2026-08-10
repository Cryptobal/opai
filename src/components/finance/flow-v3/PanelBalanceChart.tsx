"use client";

import { useId, useMemo } from "react";
import { fmtClp } from "./format";

/** Gráfico de saldo acumulado semanal (proyección hacia adelante). */
export function PanelBalanceChart({
  series,
  warn,
}: {
  series: Array<{ weekStart: string; label: string; balance: number }>;
  warn: number;
}) {
  const gid = useId().replace(/:/g, "");
  const gradId = `bal-fill-${gid}`;
  const lineGradId = `bal-line-${gid}`;
  const glowId = `bal-glow-${gid}`;

  const layout = useMemo(() => {
    if (series.length === 0) return null;
    const vals = series.map((s) => s.balance);
    const min = Math.min(...vals, warn, 0);
    const max = Math.max(...vals, 0);
    const pad = (max - min) * 0.12 || 1_000_000;
    const y0 = min - pad;
    const y1 = max + pad;
    const w = 640;
    const h = 200;
    const padL = 8;
    const padR = 8;
    const padT = 16;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const n = series.length;
    const xAt = (i: number) =>
      padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => padT + plotH - ((v - y0) / (y1 - y0)) * plotH;

    const points = series.map((s, i) => ({
      x: xAt(i),
      y: yAt(s.balance),
      ...s,
    }));

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1]!.x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${points[0]!.x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : "";

    const zeroY = yAt(0);
    const warnY = yAt(warn);
    const labelStep = n > 10 ? 2 : 1;
    const last = points[points.length - 1];
    const first = points[0];
    const minPt = points.reduce((a, b) => (b.balance < a.balance ? b : a), points[0]!);
    const maxPt = points.reduce((a, b) => (b.balance > a.balance ? b : a), points[0]!);

    return {
      w, h, padT, padB, plotH, zeroY, warnY, linePath, areaPath, points,
      labelStep, last, first, minPt, maxPt,
    };
  }, [series, warn]);

  if (!layout) {
    return <p className="text-[13px] text-ds-text-4">Sin series</p>;
  }

  const {
    w, h, zeroY, warnY, linePath, areaPath, points, labelStep, last, minPt,
  } = layout;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-48 w-full sm:h-56"
        role="img"
        aria-label="Saldo acumulado proyectado por semana"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <style>{`
            @keyframes bal-draw-${gid} {
              from { stroke-dashoffset: 1; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes bal-fade-${gid} {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes bal-pulse-${gid} {
              0%, 100% { r: 4.5; }
              50% { r: 6; }
            }
            .bal-line-${gid} {
              stroke-dasharray: 1;
              stroke-dashoffset: 1;
              animation: bal-draw-${gid} 1.1s ease-out forwards;
            }
            .bal-area-${gid} {
              opacity: 0;
              animation: bal-fade-${gid} 0.7s ease-out 0.35s forwards;
            }
            .bal-head-${gid} {
              animation: bal-pulse-${gid} 2.4s ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .bal-line-${gid}, .bal-area-${gid}, .bal-head-${gid} {
                animation: none !important;
                stroke-dashoffset: 0;
                opacity: 1;
              }
            }
          `}</style>
        </defs>

        {/* Cero */}
        <line
          x1={8}
          y1={zeroY}
          x2={w - 8}
          y2={zeroY}
          className="stroke-ds-border-default"
          strokeWidth={1}
          strokeDasharray="3 4"
        />

        {/* Umbral warn */}
        {warn !== 0 && (
          <line
            x1={8}
            y1={warnY}
            x2={w - 8}
            y2={warnY}
            className="stroke-status-warn"
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.7}
          />
        )}

        {/* Área bajo la curva */}
        <path
          d={areaPath}
          fill={`url(#${gradId})`}
          className={`bal-area-${gid}`}
        />

        {/* Línea de saldo (trazo hacia adelante) */}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${lineGradId})`}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          filter={`url(#${glowId})`}
          className={`bal-line-${gid}`}
        />

        {/* Puntos */}
        {points.map((p, i) => {
          const danger = p.balance < 0 && p.balance < warn;
          const isLast = i === points.length - 1;
          return (
            <g key={p.weekStart}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 4.5 : 3}
                className={
                  danger
                    ? "fill-status-danger"
                    : isLast
                      ? "fill-primary"
                      : "fill-primary/80"
                }
                opacity={isLast ? 1 : 0.85}
              >
                <title>{`${p.label}: ${fmtClp(p.balance)}`}</title>
              </circle>
              {isLast && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4.5}
                  className={`bal-head-${gid} fill-none stroke-primary`}
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              )}
            </g>
          );
        })}

        {/* Etiquetas de semana (eje X) */}
        {points.map((p, i) => {
          if (i % labelStep !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={`lbl-${p.weekStart}`}
              x={p.x}
              y={h - 8}
              textAnchor="middle"
              className="fill-ds-text-4"
              style={{ fontSize: 12 }}
            >
              {p.label.replace(/^S/, "S")}
            </text>
          );
        })}
      </svg>

      {/* Resumen bajo el gráfico */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ds-text-3">
        <span>
          Mín.{" "}
          <span
            className={`font-medium tabular-nums ${
              minPt.balance < 0 ? "text-status-danger-fg" : "text-ds-text-1"
            }`}
          >
            {fmtClp(minPt.balance)}
          </span>
          <span className="text-ds-text-4"> · {minPt.label}</span>
        </span>
        {last && (
          <span>
            Fin horizonte{" "}
            <span
              className={`font-medium tabular-nums ${
                last.balance < 0 ? "text-status-danger-fg" : "text-ds-text-1"
              }`}
            >
              {fmtClp(last.balance)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
