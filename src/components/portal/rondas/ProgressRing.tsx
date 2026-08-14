"use client";

interface Props {
  completed: number;
  total: number;
  size?: number;
}

export function ProgressRing({ completed, total, size = 44 }: Props) {
  const pct = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeWidth = size >= 64 ? 5 : 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const colorClass = pct >= 1 ? "text-status-ok" : "text-primary";

  return (
    <div className={`relative flex items-center justify-center ${colorClass}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-ds-border-default"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span className="absolute font-mono text-[12px] font-bold tabular-nums">
        {completed}/{total}
      </span>
    </div>
  );
}
