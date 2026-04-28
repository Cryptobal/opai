/**
 * Orquestador público del scoring:
 *   scoreAssessment(assessmentId) → persiste PsychResult y actualiza status.
 *
 * Diseño tolerante: si IA falla para OPEN, se registra error y se usa 0.5
 * fallback; nunca bloquea el score global.
 */

import { prisma } from "@/lib/prisma";
import type { PsychResult } from "@prisma/client";
import { PSYCH_SCORING_VERSION } from "../constants";
import type { OpenAnalysisResult, PsychAlert } from "../types";
import { resolveTenantPsychConfig } from "./config";
import {
  computeLieScore,
  detectFastLatency,
  detectStraightLining,
  isHighLie,
} from "./detectors";
import { aggregateScores } from "./aggregate";
import { decideBand } from "./band";
import { buildAlerts } from "./alerts";
import { analyzeOpenResponse } from "../ai/analyzeOpen";
import { prepareBuckets, type LoadedAssessmentItem } from "./prepare";
import { notifyCreatorOfScored } from "./notify";

export async function scoreAssessment(
  assessmentId: string,
): Promise<PsychResult> {
  const assessment = await prisma.psychAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      responses: true,
      version: { include: { items: true } },
    },
  });
  if (!assessment) throw new Error(`Assessment ${assessmentId} no encontrado`);

  const config = await resolveTenantPsychConfig(assessment.tenantId);

  const itemsMap = new Map<string, LoadedAssessmentItem>();
  for (const i of assessment.version.items) {
    itemsMap.set(i.id, {
      id: i.id,
      order: i.order,
      type: i.type,
      dimension: i.dimension,
      prompt: i.prompt,
      scoringKey: i.scoringKey,
      reverseScore: i.reverseScore,
      weight: i.weight,
      minLatencyMs: i.minLatencyMs,
    });
  }

  const buckets = prepareBuckets(
    assessment.responses.map((r) => ({
      itemId: r.itemId,
      value: r.value,
      latencyMs: r.latencyMs,
    })),
    itemsMap,
  );

  const openAnalyses: OpenAnalysisResult[] = [];
  for (const o of buckets.openToAnalyze) {
    openAnalyses.push(
      await analyzeOpenResponse({
        itemId: o.itemId,
        prompt: o.prompt,
        text: o.text,
        dimensions: o.dimensions,
      }),
    );
  }

  const lieScore = computeLieScore(buckets.lieInputs);
  const straightLining = detectStraightLining(buckets.likertSamples);
  const fastLatency = detectFastLatency(buckets.latencyRows);

  const { dimensions, globalScore } = aggregateScores({
    scoredResponses: buckets.scoredResponses,
    openAnalyses,
    config,
  });

  const band = decideBand({
    globalScore,
    thresholdFit: config.thresholdFit,
    thresholdCaution: config.thresholdCaution,
    highLie: isHighLie(lieScore),
    straightLining,
  });

  const alerts: PsychAlert[] = buildAlerts({
    dimensions,
    openAnalyses,
    lieScore,
    lieHits: buckets.lieHits,
    straightLining,
    likertSamples: buckets.likertSamples,
    fastLatency,
    latencyRows: buckets.latencyRows,
    scoredResponses: buckets.scoredResponses,
    items: itemsMap,
    responsesById: buckets.responsesById,
  });

  const dimensionScores: Record<string, { score: number; itemCount: number }> =
    {};
  for (const d of dimensions) {
    dimensionScores[d.dimension] = { score: d.score, itemCount: d.itemCount };
  }

  const persisted = await prisma.$transaction(async (tx) => {
    const r = await tx.psychResult.upsert({
      where: { assessmentId },
      create: {
        assessmentId,
        globalScore,
        band,
        dimensionScores: dimensionScores as never,
        alerts: alerts as never,
        lieScaleScore: lieScore,
        straightLining,
        openAnalysis: openAnalyses as never,
        scoringVersion: PSYCH_SCORING_VERSION,
      },
      update: {
        globalScore,
        band,
        dimensionScores: dimensionScores as never,
        alerts: alerts as never,
        lieScaleScore: lieScore,
        straightLining,
        openAnalysis: openAnalyses as never,
        scoringVersion: PSYCH_SCORING_VERSION,
      },
    });
    await tx.psychAssessment.update({
      where: { id: assessmentId },
      data: { status: "SCORED", scoredAt: new Date() },
    });
    return r;
  });

  // Notificación al creador (email vía Resend) — tolerante a fallo para
  // nunca bloquear el flujo principal.
  notifyCreatorOfScored(assessmentId).catch((e) => {
    console.error("[psych/score] notify failed:", e);
  });

  return persisted;
}
