"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  PSYCH_DIMENSION_LABELS,
  PSYCH_DIMENSIONS,
  type PsychDimension,
} from "@/lib/psych/constants";
import { useThemeColor } from "@/lib/theme/resolveColor";

interface Props {
  dimensionScores: Record<string, { score: number; itemCount: number }>;
  thresholdFit: number;
}

export default function PsychRadarChart({
  dimensionScores,
  thresholdFit,
}: Props) {
  const foreground = useThemeColor("--foreground");
  const muted = useThemeColor("--muted-foreground");
  const border = useThemeColor("--border");
  const primary = useThemeColor("--primary");

  const data = PSYCH_DIMENSIONS.map((dim) => ({
    dimension: PSYCH_DIMENSION_LABELS[dim as PsychDimension],
    score: Math.round((dimensionScores[dim]?.score ?? 0) * 100),
    threshold: thresholdFit,
  }));

  return (
    <div className="w-full aspect-square max-w-md mx-auto md:max-w-none md:aspect-auto md:h-[340px]">
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid stroke={border} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: foreground, fontSize: 11 }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fill: muted, fontSize: 10 }}
          />
          <Radar
            name="Candidato"
            dataKey="score"
            stroke={primary}
            fill={primary}
            fillOpacity={0.25}
          />
          <Radar
            name="Umbral apto"
            dataKey="threshold"
            stroke="#16a34a"
            fill="transparent"
            strokeDasharray="4 4"
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--foreground))",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
