"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "./types";

/* ─── Custom Tooltip ─── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-status-info-fg">
        {payload[0].value}
      </p>
    </div>
  );
}

/* ─── Props ─── */

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
  className?: string;
}

/* ─── Component ─── */

export function TrendChart({
  data,
  height = 200,
  className,
}: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        Sin datos de tendencia
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            fontSize={11}
            fill="rgba(255,255,255,0.3)"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            fontSize={11}
            fill="rgba(255,255,255,0.3)"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine
            y={70}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="4 4"
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.08)" }}
          />
          <Line
            type="monotone"
            dataKey="trustScore"
            stroke="#14b8a6"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#14b8a6", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#14b8a6", strokeWidth: 2, stroke: "#0f766e" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
