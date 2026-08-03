"use client";

/** SVG simple de saldo proyectado (sin libs nuevas). */
export function PanelBalanceChart({
  series,
  warn,
}: {
  series: Array<{ weekStart: string; label: string; balance: number }>;
  warn: number;
}) {
  if (series.length === 0) {
    return <p className="text-[13px] text-ds-text-4">Sin series</p>;
  }
  const vals = series.map((s) => s.balance);
  const min = Math.min(...vals, warn, 0);
  const max = Math.max(...vals, 0);
  const pad = (max - min) * 0.08 || 1;
  const y0 = min - pad;
  const y1 = max + pad;
  const w = 320;
  const h = 120;
  const n = series.length;
  const xAt = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const yAt = (v: number) => h - ((v - y0) / (y1 - y0)) * h;
  const path = series
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(s.balance).toFixed(1)}`)
    .join(" ");
  const zeroY = yAt(0);
  const warnY = yAt(warn);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full text-primary" role="img" aria-label="Saldo proyectado">
      <line x1={0} y1={zeroY} x2={w} y2={zeroY} className="stroke-ds-border-default" strokeWidth={1} />
      {warn !== 0 && (
        <line
          x1={0}
          y1={warnY}
          x2={w}
          y2={warnY}
          className="stroke-status-warn"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
      {series.map((s, i) => (
        <circle
          key={s.weekStart}
          cx={xAt(i)}
          cy={yAt(s.balance)}
          r={3}
          className={s.balance < 0 && s.balance < warn ? "fill-status-danger" : "fill-primary"}
        />
      ))}
    </svg>
  );
}
