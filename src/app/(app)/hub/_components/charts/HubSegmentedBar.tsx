interface BarSegment {
  value: number;
  color: string;
  label: string;
}

interface HubSegmentedBarProps {
  segments: BarSegment[];
  showLegend?: boolean;
  height?: number;
}

/**
 * Horizontal stacked progress bar with optional legend below.
 * Used for rounds breakdown (completed/inProgress/missed/pending).
 */
export function HubSegmentedBar({
  segments,
  showLegend = true,
  height = 8,
}: HubSegmentedBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className="space-y-2">
      <div
        className="flex w-full overflow-hidden rounded-full bg-muted"
        style={{ height }}
      >
        {total > 0 &&
          segments.map((seg, i) => {
            const pct = (seg.value / safeTotal) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={`${seg.label}-${i}`}
                className="h-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: seg.color,
                }}
                title={`${seg.label}: ${seg.value}`}
              />
            );
          })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((seg, i) => (
            <div
              key={`legend-${seg.label}-${i}`}
              className="flex items-center gap-1.5"
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-[10px] text-muted-foreground">
                {seg.label}{' '}
                <span className="font-bold tabular-nums text-foreground">
                  {seg.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
