interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

interface HubMiniDonutProps {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel?: string;
  size?: number;
  thickness?: number;
}

/**
 * Pure SVG mini donut chart for KPI breakdowns (e.g., attendance).
 * Renders concentric arcs with center text.
 */
export function HubMiniDonut({
  segments,
  centerValue,
  centerLabel,
  size = 96,
  thickness = 12,
}: HubMiniDonutProps) {
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  // Avoid 0/0
  const safeTotal = total > 0 ? total : 1;

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const fraction = seg.value / safeTotal;
    const dasharray = `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
    const dashoffset = -((cumulative * circumference) / 1).toFixed(2);
    cumulative += fraction;
    return {
      key: `${seg.label}-${i}`,
      color: seg.color,
      dasharray,
      dashoffset,
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-label="Donut chart"
    >
      {/* Background ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={thickness}
      />
      {/* Segments */}
      {total > 0 &&
        arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
      {/* Center text */}
      <text
        x={cx}
        y={cy + (centerLabel ? -2 : 4)}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 18, fontWeight: 700 }}
      >
        {centerValue}
      </text>
      {centerLabel && (
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 9 }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
