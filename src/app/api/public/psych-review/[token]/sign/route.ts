/**
 * POST /api/public/psych-review/[token]/sign
 *
 * Body: { reviewerName, reviewerLicense?, reviewNote, accepted: true }
 *
 * Registra la firma del psicólogo externo en el PsychResult, marca el
 * assessment como REVIEWED, invalida el token (lo borra) y registra audit.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { verifyPsychReviewToken } from "@/lib/psych/review-token";

interface Ctx {
  params: Promise<{ token: string }>;
}

const Body = z.object({
  reviewerName: z.string().min(2).max(200),
  reviewerLicense: z.string().max(100).optional().nullable(),
  reviewNote: z.string().min(10).max(5000),
  accepted: z.literal(true),
});

export async function POST(req: NextRequest, { params }: Ctx) {
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

  const parsed = await parseBody(req, Body);
  if (parsed.error) return parsed.error;

  const a = await prisma.psychAssessment.findFirst({
    where: { id: v.aid, tenantId: v.tid },
    include: { result: true },
  });
  if (!a?.result || a.result.reviewRequestToken !== token) {
    return NextResponse.json(
      { success: false, error: "Enlace inválido" },
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
  if (a.result.reviewedAt) {
    return NextResponse.json(
      { success: false, error: "Este informe ya fue firmado" },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.psychResult.update({
      where: { assessmentId: a.id },
      data: {
        reviewedBy: parsed.data.reviewerName,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
        reviewerLicense:
          parsed.data.reviewerLicense ?? a.result?.reviewerLicense ?? null,
        // Invalidar token tras la firma.
        reviewRequestToken: null,
      },
    });
    await tx.psychAssessment.update({
      where: { id: a.id },
      data: { status: "REVIEWED" },
    });
  });

  await logAudit({
    tenantId: v.tid,
    action: "UPDATE",
    entity: "psych_result",
    entityId: a.result.id,
    details: {
      event: "psych.review.signed",
      reviewerName: parsed.data.reviewerName,
      reviewerEmail: v.eml,
      reviewerLicense: parsed.data.reviewerLicense,
    },
    request: req,
  });

  return NextResponse.json({ success: true });
}
