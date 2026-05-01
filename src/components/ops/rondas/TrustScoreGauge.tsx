import { cn } from "@/lib/utils";

interface TrustScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  trend?: number; // positive = up, negative = down
}

export function TrustScoreGauge({ score, size = "md", showLabel = true, trend }: TrustScoreGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const color = clamped >= 70 ? "#22c55e" : clamped >= 40 ? "#f59e0b" : "#ef4444";
  const textColor = clamped >= 70 ? "text-status-ok-fg" : clamped >= 40 ? "text-status-warn-fg" : "text-status-danger-fg";

  const dims = { sm: 40, md: 64, lg: 96 };
  const strokeWidths = { sm: 4, md: 5, lg: 6 };
  const dim = dims[size];
  const strokeWidth = strokeWidths[size];
  const radius = (dim - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = dim / 2;

  const trendIcon = trend !== undefined
    ? trend > 0 ? "↑" : trend < 0 ? "↓" : "→"
    : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("font-bold tabular-nums leading-none", textColor,
              size === "sm" ? "text-[10px]" : size === "md" ? "text-sm" : "text-xl"
            )}>
              {clamped}
            </span>
          </div>
        )}
      </div>
      {trend !== undefined && (
        <span className={cn("text-[10px] font-semibold", trend > 0 ? "text-status-ok-fg" : trend < 0 ? "text-status-danger-fg" : "text-[#64748b]")}>
          {trendIcon}{Math.abs(trend)}%
        </span>
      )}
    </div>
  );
}
