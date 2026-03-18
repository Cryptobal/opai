"use client";

interface Props {
  completed: number;
  total: number;
  size?: number;
}

export function ProgressRing({ completed, total, size = 44 }: Props) {
  const pct = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = pct >= 1 ? "#22c55e" : "#14b8a6";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
        />
      </svg>
      {/* Center text */}
      <span
        className="absolute text-xs font-bold"
        style={{ color }}
      >
        {completed}/{total}
      </span>
    </div>
  );
}
