/**
 * GET /api/collaborator-portal/psych/my-profile?guardiaId=XXX
 *
 * Retorna la evaluación psicolaboral del COLABORADOR AUTENTICADO.
 * Nunca expone score numérico, banda, debilidades ni análisis IA.
 * Solo: fecha de última evaluación, próxima reevaluación, top 3 fortalezas
 * en texto positivo, y link ARCO para solicitar informe completo.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPsychCollaborator } from "@/lib/psych/collaborator-guard";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";
import { PSYCH_DIMENSION_LABELS, type PsychDimension } from "@/lib/psych/constants";

const STRENGTH_PREFIX: Record<PsychDimension, string> = {
  IMPULSE_CONTROL: "Buen control de impulsos",
  FRUSTRATION_TOLERANCE: "Alta tolerancia a la frustración",
  EMOTIONAL_STABILITY: "Estabilidad emocional",
  STRESS_MANAGEMENT: "Buen manejo del estrés",
  SUSTAINED_ATTENTION: "Atención sostenida",
  REASONING: "Buen razonamiento",
  INTEGRITY: "Alta integridad",
  RESPONSIBILITY: "Alta responsabilidad",
  VOCATIONAL_FIT: "Vocación de servicio y seguridad",
};

const MS_PER_MONTH = 30 * 24 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const guard = await guardPsychCollaborator(req);
  if (!guard.ok) return guard.response;
  const { personaId, tenantId } = guard.ctx;

  const tenantCfg = await resolveTenantPsychConfig(tenantId);

  const last = await prisma.psychAssessment.findFirst({
    where: {
      tenantId,
      personaId,
      status: { in: ["SCORED", "REVIEWED"] },
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      result: {
        select: { dimensionScores: true },
      },
    },
  });

  const arcoRequestUrl =
    process.env.PSYCH_ARCO_URL ?? "/portal/guardia/mis-datos";

  if (!last) {
    return NextResponse.json({
      success: true,
      hasAssessment: false,
      arcoRequestUrl,
    });
  }

  // Top 3 fortalezas: dimensiones con score ≥ 0.7, ordenadas desc.
  const scores =
    (last.result?.dimensionScores as unknown as Record<
      string,
      { score: number; itemCount: number }
    >) ?? {};
  const ranked = Object.entries(scores)
    .map(([dim, v]) => ({ dim: dim as PsychDimension, score: v.score }))
    .filter((r) => r.score >= 0.7 && r.dim in STRENGTH_PREFIX)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => ({
      dimension: r.dim,
      label: STRENGTH_PREFIX[r.dim] ?? PSYCH_DIMENSION_LABELS[r.dim],
    }));

  const nextReevaluationDate = last.submittedAt
    ? new Date(
        last.submittedAt.getTime() +
          tenantCfg.reevaluationIntervalMonths * MS_PER_MONTH,
      )
    : null;

  return NextResponse.json({
    success: true,
    hasAssessment: true,
    assessment: {
      id: last.id,
      status: last.status,
      submittedAt: last.submittedAt,
      nextReevaluationDate,
    },
    topStrengths: ranked,
    arcoRequestUrl,
  });
}
