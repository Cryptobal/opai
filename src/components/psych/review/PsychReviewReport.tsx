"use client";

import {
  PSYCH_DIMENSIONS,
  PSYCH_DIMENSION_LABELS,
  type PsychDimension,
} from "@/lib/psych/constants";
import PsychBandBadge from "@/components/psych/dashboard/PsychBandBadge";

interface Props {
  result: {
    globalScore: number;
    band: string;
    dimensionScores: Record<string, { score: number; itemCount: number }>;
    alerts: Array<{ message: string; severity: string }>;
    lieScaleScore: number | null;
    straightLining: boolean;
  };
}

export default function PsychReviewReport({ result }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase mb-1">
          Puntaje global
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-foreground">
            {result.globalScore.toFixed(1)}
          </span>
          <span className="text-muted-foreground">/ 100</span>
          <PsychBandBadge band={result.band} />
        </div>
        {result.lieScaleScore !== null ? (
          <p className="text-xs text-muted-foreground mt-3">
            Escala de validez: {Math.round((result.lieScaleScore ?? 0) * 100)}%
            {result.straightLining ? " · Patrón uniforme detectado" : ""}
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h3 className="text-base font-semibold text-foreground mb-2">
          Perfil por dimensión
        </h3>
        {PSYCH_DIMENSIONS.filter(
          (dim) => (result.dimensionScores[dim]?.itemCount ?? 0) > 0,
        ).map((dim) => {
          const s = result.dimensionScores[dim]?.score ?? 0;
          const pct = Math.round(s * 100);
          return (
            <div key={dim}>
              <div className="flex justify-between text-xs text-foreground/90 mb-1">
                <span>
                  {PSYCH_DIMENSION_LABELS[dim as PsychDimension] ?? dim}
                </span>
                <span>{pct}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {result.alerts.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-2">
            Alertas
          </h3>
          <ul className="space-y-1 text-sm text-foreground/90">
            {result.alerts.map((a, i) => (
              <li key={i}>• {a.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
