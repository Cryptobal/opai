/**
 * GET /api/psych/assessments/[id]/report.pdf — genera el informe PDF usando
 * @react-pdf/renderer (mismo pipeline que reportes-dt/cpq).
 */

import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { guardPsych } from "@/lib/psych/api-guard";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";
import { PsychReportPdf } from "@/components/psych/pdf/PsychReportPdf";
import type { OpenAnalysisResult, PsychAlert } from "@/lib/psych/types";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const assessment = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: guard.ctx.tenantId },
    include: {
      result: true,
      version: { select: { code: true, version: true, name: true } },
    },
  });
  if (!assessment || !assessment.result) {
    return NextResponse.json(
      { success: false, error: "Informe no disponible (evaluación sin resultado)" },
      { status: 404 },
    );
  }

  const cfg = await resolveTenantPsychConfig(guard.ctx.tenantId);
  const dimensionScores =
    (assessment.result.dimensionScores as unknown as Record<
      string,
      { score: number; itemCount: number }
    >) ?? {};
  const alerts = (assessment.result.alerts as unknown as PsychAlert[]) ?? [];
  const openAnalysis =
    (assessment.result.openAnalysis as unknown as OpenAnalysisResult[]) ?? [];

  const reviewer =
    assessment.result.reviewedBy && assessment.result.reviewedAt
      ? { name: assessment.result.reviewedBy, date: assessment.result.reviewedAt }
      : null;

  const buffer = await renderToBuffer(
    PsychReportPdf({
      logoUrl: cfg.brandLogoUrl,
      candidate: { name: assessment.targetName, rut: assessment.targetRut },
      version: `${assessment.version.code}@${assessment.version.version}`,
      globalScore: assessment.result.globalScore,
      band: assessment.result.band,
      dimensionScores,
      alerts,
      openAnalysis,
      reviewer,
      generatedAt: new Date(),
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="psicolaboral-${assessment.targetName.replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
