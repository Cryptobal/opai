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

interface Props {
  dimensionScores: Record<string, { score: number; itemCount: number }>;
  thresholdFit: number;
}

export default function PsychRadarChart({ dimensionScores, thresholdFit }: Props) {
  const data = PSYCH_DIMENSIONS.map((dim) => ({
    dimension: PSYCH_DIMENSION_LABELS[dim as PsychDimension],
    score: Math.round((dimensionScores[dim]?.score ?? 0) * 100),
    threshold: thresholdFit,
  }));

  return (
    <div className="w-full h-[340px]">
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "#475569", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <Radar
            name="Candidato"
            dataKey="score"
            stroke="#0f172a"
            fill="#0f172a"
            fillOpacity={0.25}
          />
          <Radar
            name="Umbral apto"
            dataKey="threshold"
            stroke="#16a34a"
            fill="transparent"
            strokeDasharray="4 4"
          />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
