"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";

/* ── Palette — matches existing design system ── */

const PALETTE = {
  teal: "#1db990",
  red: "rgba(239,68,68,0.6)",
  amber: "#f59e0b",
  blue: "#3b82f6",
  grid: "rgba(255,255,255,0.04)",
  axis: "rgba(255,255,255,0.3)",
  threshold: "rgba(239,68,68,0.3)",
};

/* ── Types ── */

type InstallationKpi = {
  installationName: string;
  cumplimiento: number;
  omitidas: number;
  completadas: number;
  totalRondas: number;
};

type WeeklyTrend = {
  weekLabel: string;
  cumplimiento: number;
  totalRondas: number;
  completadas: number;
};

/* ── Custom Tooltip ── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    name?: string;
    value?: number;
    dataKey?: string;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const nameMap: Record<string, string> = {
    cumplimiento: "Cumplimiento",
    completadas: "Completadas",
    omitidas: "Omitidas",
  };
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {nameMap[entry.dataKey || ""] || entry.name}
          </span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {entry.dataKey === "cumplimiento" ? `${entry.value}%` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Main charts component ── */

export function ControlNocturnoKpisCharts({
  installations,
  weeklyTrend,
}: {
  installations: InstallationKpi[];
  weeklyTrend: WeeklyTrend[];
}) {
  // For bar chart: sort by cumplimiento ascending (worst first), take top 20
  const barData = installations.slice(0, 20).map((i) => ({
    name:
      i.installationName.length > 18
        ? i.installationName.slice(0, 16) + "…"
        : i.installationName,
    cumplimiento: i.cumplimiento,
    omitidas: i.omitidas,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Cumplimiento por instalación ── */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Cumplimiento por instalación</h3>
          {barData.length === 0 ? (
            <EmptyChart message="Sin datos en el período" />
          ) : (
            <div
              style={{ height: Math.max(250, barData.length * 32) }}
              className="w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke={PALETTE.grid}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: PALETTE.axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: PALETTE.axis }}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <ReferenceLine
                    x={80}
                    stroke={PALETTE.threshold}
                    strokeDasharray="4 4"
                    label={{
                      value: "80%",
                      position: "top",
                      fill: PALETTE.threshold,
                      fontSize: 10,
                    }}
                  />
                  <Bar
                    dataKey="cumplimiento"
                    name="Cumplimiento"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                  >
                    <LabelList
                      dataKey="cumplimiento"
                      position="right"
                      formatter={(v) => `${v ?? 0}%`}
                      style={{
                        fontSize: 10,
                        fill: "rgba(255,255,255,0.5)",
                        fontWeight: 500,
                      }}
                    />
                    {barData.map((entry, index) => (
                      <rect
                        key={index}
                        fill={
                          entry.cumplimiento >= 80
                            ? PALETTE.teal
                            : entry.cumplimiento >= 50
                              ? PALETTE.amber
                              : PALETTE.red
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tendencia semanal ── */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Tendencia semanal</h3>
          {weeklyTrend.length === 0 ? (
            <EmptyChart message="Sin datos en el período" />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={weeklyTrend}
                  margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 11, fill: PALETTE.axis }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: PALETTE.axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <ReferenceLine
                    y={80}
                    stroke={PALETTE.threshold}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="cumplimiento"
                    stroke={PALETTE.teal}
                    strokeWidth={2}
                    dot={{ r: 4, fill: PALETTE.teal, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex items-center justify-center gap-4">
            <LegendDot color={PALETTE.teal} label="Cumplimiento" />
            <LegendDot color={PALETTE.threshold} label="Umbral 80%" dashed />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Helpers ── */

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {dashed ? (
        <span
          className="h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center">
      <p className="text-sm text-muted-foreground/60">{message}</p>
    </div>
  );
}
