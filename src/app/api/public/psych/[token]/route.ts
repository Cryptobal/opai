/**
 * GET /api/public/psych/[token] — metadata del assessment + items SIN
 * scoringKey (nunca exponemos cómo se puntúa). Retorna también las respuestas
 * ya dadas para que el wizard pueda retomar donde quedó.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPublicAssessment } from "@/lib/psych/public-guard";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";

interface Ctx {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const g = await loadPublicAssessment(token);
  if (!g.ok) return g.response;

  const [version, responses, cfg] = await Promise.all([
    prisma.psychTestVersion.findUnique({
      where: { id: g.assessment.versionId },
      select: {
        code: true,
        version: true,
        name: true,
        items: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            type: true,
            prompt: true,
            options: true,
            minLatencyMs: true,
            maxLatencyMs: true,
            // scoringKey intencionalmente omitido
          },
        },
      },
    }),
    prisma.psychResponse.findMany({
      where: { assessmentId: g.assessment.id },
      select: { itemId: true, value: true, latencyMs: true, answeredAt: true },
    }),
    resolveTenantPsychConfig(g.assessment.tenantId),
  ]);

  if (!version) {
    return NextResponse.json(
      { success: false, error: "Versión no encontrada" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    assessment: {
      id: g.assessment.id,
      status: g.assessment.status,
      startedAt: g.assessment.startedAt,
      submittedAt: g.assessment.submittedAt,
      consentAcceptedAt: g.assessment.consentAcceptedAt,
      expiresAt: g.assessment.expiresAt,
      targetName: g.assessment.targetName,
    },
    version: {
      code: version.code,
      version: version.version,
      name: version.name,
      items: version.items,
    },
    responses,
    branding: {
      logoUrl: cfg.brandLogoUrl,
      primaryColor: cfg.brandPrimaryColor,
    },
  });
}
