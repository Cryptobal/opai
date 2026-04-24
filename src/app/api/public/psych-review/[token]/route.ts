/**
 * GET /api/public/psych-review/[token]
 *
 * Carga el informe para el psicólogo externo (sin auth NextAuth).
 * Valida firma + email coincidente + token activo (no expirado ni usado).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPsychReviewToken } from "@/lib/psych/review-token";

interface Ctx {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  let v;
  try {
    v = await verifyPsychReviewToken(token);
  } catch {
    return NextResponse.json(
      { success: false, error: "Enlace inválido o expirado" },
      { status: 401 },
    );
  }

  const a = await prisma.psychAssessment.findFirst({
    where: { id: v.aid, tenantId: v.tid },
    include: {
      result: true,
      version: { select: { code: true, version: true, name: true } },
    },
  });
  if (!a || !a.result) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }
  if (a.result.reviewRequestToken !== token) {
    return NextResponse.json(
      { success: false, error: "Enlace reemplazado por uno más reciente" },
      { status: 401 },
    );
  }
  if (
    a.result.reviewRequestExpires &&
    a.result.reviewRequestExpires.getTime() < Date.now()
  ) {
    return NextResponse.json(
      { success: false, error: "Enlace expirado" },
      { status: 410 },
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: v.tid },
    select: { name: true },
  });

  return NextResponse.json({
    success: true,
    tenant: { name: tenant?.name ?? "—" },
    candidate: { name: a.targetName, rut: a.targetRut },
    version: a.version,
    reviewer: {
      email: a.result.reviewerEmail,
      license: a.result.reviewerLicense,
    },
    alreadySigned: !!a.result.reviewedAt,
    result: {
      globalScore: a.result.globalScore,
      band: a.result.band,
      dimensionScores: a.result.dimensionScores,
      alerts: a.result.alerts,
      openAnalysis: a.result.openAnalysis,
      lieScaleScore: a.result.lieScaleScore,
      straightLining: a.result.straightLining,
    },
  });
}
