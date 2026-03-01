"use client";

import { useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";

interface DailyPoint {
  date: string;
  compliance: number;
  total: number;
  completed: number;
}

interface Props {
  data: DailyPoint[];
  daysRange: number;
  onDaysChange: (d: number) => void;
}

const DAY_OPTIONS = [7, 14, 30];

function barColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#3b82f6";
  return "#f59e0b";
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: DailyPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Cumplimiento: <span className="font-semibold text-foreground">{d?.compliance ?? 0}%</span>
      </p>
      <p className="text-muted-foreground">
        {d?.completed ?? 0}/{d?.total ?? 0} completadas
      </p>
    </div>
  );
}

export function RondasComplianceChart({ data, daysRange, onDaysChange }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const sliced = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-daysRange);
  }, [data, daysRange]);

  const formatted = useMemo(
    () =>
      sliced.map((d) => ({
        ...d,
        label: new Date(d.date + "T12:00:00").toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [sliced],
  );

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Cumplimiento diario</h3>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  daysRange === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div ref={chartRef} className="h-[260px]">
          {formatted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Sin datos en el período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formatted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={90} stroke="rgba(34,197,94,0.25)" strokeDasharray="4 4" />
                <ReferenceLine y={70} stroke="rgba(59,130,246,0.25)" strokeDasharray="4 4" />
                <Bar
                  dataKey="compliance"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  onMouseEnter={(_, idx) => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {formatted.map((entry, idx) => (
                    <Cell
                      key={entry.date}
                      fill={barColor(entry.compliance)}
                      opacity={hoveredIdx !== null && hoveredIdx !== idx ? 0.4 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
