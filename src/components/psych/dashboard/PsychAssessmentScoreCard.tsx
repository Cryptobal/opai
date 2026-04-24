"use client";

import PsychBandBadge from "./PsychBandBadge";
import PsychAlertsList from "./PsychAlertsList";
import type { PsychAlert } from "@/lib/psych/types";

interface Props {
  assessmentId: string;
  globalScore: number;
  band: string;
  lieScaleScore: number | null;
  straightLining: boolean;
  alerts: PsychAlert[];
}

export default function PsychAssessmentScoreCard({
  assessmentId,
  globalScore,
  band,
  lieScaleScore,
  straightLining,
  alerts,
}: Props) {
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase mb-1">
          Puntaje global
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-foreground">
            {globalScore.toFixed(1)}
          </span>
          <span className="text-muted-foreground">/ 100</span>
        </div>
        <div className="mt-3">
          <PsychBandBadge band={band} />
        </div>
        <dl className="mt-4 text-xs text-muted-foreground space-y-1">
          {lieScaleScore !== null ? (
            <div className="flex justify-between">
              <dt>Escala de validez</dt>
              <dd>{Math.round((lieScaleScore ?? 0) * 100)}%</dd>
            </div>
          ) : null}
          {straightLining ? (
            <div className="flex justify-between">
              <dt>Patrón uniforme</dt>
              <dd>Sí</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-3">
          Alertas
        </h3>
        <PsychAlertsList alerts={alerts} />
      </div>
      <a
        href={`/api/psych/assessments/${assessmentId}/report.pdf`}
        className="w-full text-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-3 text-sm min-h-[44px] flex items-center justify-center"
      >
        Descargar informe PDF
      </a>
    </>
  );
}
