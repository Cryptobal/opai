"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ALERT_CATALOG } from "@/lib/rondas/alert-catalog";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#06b6d4",
};

interface Props {
  alertsByType: Record<string, number>;
}

export function AlertDistributionChart({ alertsByType }: Props) {
  const data = useMemo(() => {
    return Object.entries(alertsByType)
      .map(([tipo, count]) => {
        const def = ALERT_CATALOG[tipo as keyof typeof ALERT_CATALOG];
        return {
          tipo,
          label: def?.label ?? tipo.replace(/_/g, " "),
          count,
          severity: def?.defaultSeverity ?? "warning",
          color: SEVERITY_COLORS[def?.defaultSeverity ?? "warning"] ?? SEVERITY_COLORS.warning,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [alertsByType]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[#64748b]">
        Sin alertas en el periodo
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <XAxis
          type="number"
          tick={{ fill: "#64748b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fill: "#94a3b8", fontSize: 10 }}
          width={120}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={{
            backgroundColor: "#0a0f1c",
            border: "1px solid #1a1f2e",
            borderRadius: 8,
            fontSize: 11,
            color: "#f1f5f9",
          }}
          formatter={(value: unknown) => [`${value} alertas`, ""]}
          labelFormatter={(label: unknown) => String(label)}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((entry) => (
            <Cell key={entry.tipo} fill={entry.color} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
