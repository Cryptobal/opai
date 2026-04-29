import { cn } from "@/lib/utils";
import { type Threshold, thresholdFromScore } from "./tokens";

export interface MetricBarProps {
  /** Valor 0-100. */
  value: number;
  /** Override threshold; si no, se calcula automáticamente. */
  threshold?: Threshold;
  /** Mostrar el % a la derecha. */
  showValue?: boolean;
  /** Altura. */
  size?: "sm" | "md";
  className?: string;
}

const FILL_COLOR: Record<Threshold, string> = {
  ok:      "bg-gradient-to-r from-status-ok to-status-ok/80",
  warn:    "bg-gradient-to-r from-status-warn to-status-warn/80",
  danger:  "bg-gradient-to-r from-status-danger to-status-danger/80",
  neutral: "bg-ds-text-4/40",
};

const TEXT_COLOR: Record<Threshold, string> = {
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  neutral: "text-ds-text-3",
};

export function MetricBar({
  value,
  threshold,
  showValue = false,
  size = "sm",
  className,
}: MetricBarProps) {
  const t = threshold ?? thresholdFromScore(value);
  const pct = Math.max(0, Math.min(100, value));
  const h = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-full bg-ds-surface-3",
          h,
        )}
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-emphasis", FILL_COLOR[t])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className={cn("text-[11px] font-mono ds-num shrink-0 min-w-[2.5rem] text-right", TEXT_COLOR[t])}>
          {pct}%
        </span>
      )}
    </div>
  );
}
