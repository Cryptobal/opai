"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface TrustPoint {
  index: number;
  trustScore: number;
  date: string;
}

interface Props {
  data: TrustPoint[];
  height?: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: TrustPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="text-muted-foreground">
        Ronda #{d?.index} &middot;{" "}
        {d?.date
          ? new Date(d.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
          : ""}
      </p>
      <p className="font-semibold text-foreground">Trust: {d?.trustScore ?? 0}</p>
    </div>
  );
}

export function RondasTrustTrendChart({ data, height = 200 }: Props) {
  const avg = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((s, d) => s + d.trustScore, 0) / data.length);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Sin datos de Trust Score
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="index"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `#${v}`}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={avg} stroke="rgba(59,130,246,0.4)" strokeDasharray="4 4" label="" />
          <Line
            type="monotone"
            dataKey="trustScore"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
