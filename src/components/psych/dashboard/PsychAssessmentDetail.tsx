"use client";

import { useEffect, useState } from "react";
import PsychRadarChart from "./PsychRadarChart";
import PsychOpenAnalysisCard from "./PsychOpenAnalysisCard";
import PsychAssessmentScoreCard from "./PsychAssessmentScoreCard";
import ReminderBanner from "./PsychReminderBanner";
import type { OpenAnalysisResult, PsychAlert } from "@/lib/psych/types";

interface DetailPayload {
  assessment: {
    id: string;
    status: string;
    targetName: string;
    targetPhone: string | null;
    targetEmail: string | null;
    createdAt: string;
    result: {
      globalScore: number;
      band: string;
      dimensionScores: Record<string, { score: number; itemCount: number }>;
      alerts: PsychAlert[];
      openAnalysis: OpenAnalysisResult[] | null;
      lieScaleScore: number | null;
      straightLining: boolean;
    } | null;
  };
}

export default function PsychAssessmentDetail({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [thresholdFit, setThresholdFit] = useState(80);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/psych/assessments/${assessmentId}`).then((r) => r.json()),
      fetch("/api/psych/config").then((r) => r.json()),
    ])
      .then(([d, c]) => {
        if (d.success) setData(d);
        if (c.success) setThresholdFit(c.config.thresholdFit);
      })
      .catch(console.error);
  }, [assessmentId]);

  async function handleRescore() {
    setRescoring(true);
    try {
      await fetch(`/api/psych/assessments/${assessmentId}/rescore`, { method: "POST" });
      const d = await fetch(`/api/psych/assessments/${assessmentId}`).then((r) => r.json());
      if (d.success) setData(d);
    } finally {
      setRescoring(false);
    }
  }

  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const result = data.assessment.result;
  const ageHours =
    (Date.now() - new Date(data.assessment.createdAt).getTime()) / 3_600_000;
  const showReminder =
    data.assessment.status === "PENDING" &&
    ageHours > 24 &&
    !!data.assessment.targetPhone;
  if (!result) {
    return (
      <div className="space-y-4">
        {showReminder ? (
          <ReminderBanner
            assessmentId={assessmentId}
            targetName={data.assessment.targetName}
            phone={data.assessment.targetPhone!}
          />
        ) : null}
        <div className="rounded-xl border border-border p-6 bg-card">
          <p className="text-foreground/90">
            La evaluación aún no tiene resultado. Estado actual:{" "}
            <b>{data.assessment.status}</b>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* En mobile: sidebar (score + alertas) arriba del radar. */}
      <div className="lg:order-2 space-y-4">
        <PsychAssessmentScoreCard
          assessmentId={assessmentId}
          globalScore={result.globalScore}
          band={result.band}
          lieScaleScore={result.lieScaleScore}
          straightLining={result.straightLining}
          alerts={result.alerts ?? []}
        />
      </div>
      <div className="lg:order-1 lg:col-span-2 space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Perfil por dimensión
            </h2>
            <button
              onClick={handleRescore}
              disabled={rescoring}
              className="text-xs rounded-md border border-border px-2.5 py-1.5 text-foreground/90"
            >
              {rescoring ? "Recalculando…" : "Recalcular"}
            </button>
          </div>
          <PsychRadarChart
            dimensionScores={result.dimensionScores}
            thresholdFit={thresholdFit}
          />
        </div>
        {result.openAnalysis && result.openAnalysis.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">
              Análisis cualitativo (preguntas abiertas)
            </h3>
            {result.openAnalysis.map((o) => (
              <PsychOpenAnalysisCard key={o.itemId} entry={o} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
