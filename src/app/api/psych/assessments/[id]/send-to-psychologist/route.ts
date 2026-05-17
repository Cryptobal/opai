/**
 * POST /api/psych/assessments/[id]/send-to-psychologist
 * Body: { reviewerEmail, reviewerName, reviewerLicense? }
 *
 * Genera link firmado de revisión (72h) y envía email al psicólogo
 * con link a /t/psych-review/[token]. Guarda en PsychResult el
 * token + email para que la página pública pueda validar cruzado.
 *
 * Requiere scope 'write'. El assessment debe estar SCORED o REVIEWED.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { signPsychReviewToken } from "@/lib/psych/review-token";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { buildEmailUrl } from "@/lib/emails/site-url";

interface Ctx {
  params: Promise<{ id: string }>;
}

const Body = z.object({
  reviewerEmail: z.string().email(),
  reviewerName: z.string().min(2).max(200),
  reviewerLicense: z.string().max(100).optional().nullable(),
});

const EXPIRES_HOURS = 72;

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const parsed = await parseBody(req, Body);
  if (parsed.error) return parsed.error;

  const a = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { result: true },
  });
  if (!a) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }
  if (!a.result) {
    return NextResponse.json(
      { success: false, error: "La evaluación aún no tiene resultado" },
      { status: 400 },
    );
  }

  const { token, expiresAt } = await signPsychReviewToken(
    { aid: id, tid: ctx.tenantId, eml: parsed.data.reviewerEmail },
    EXPIRES_HOURS,
  );

  await prisma.psychResult.update({
    where: { assessmentId: id },
    data: {
      reviewerEmail: parsed.data.reviewerEmail,
      reviewerLicense: parsed.data.reviewerLicense ?? null,
      reviewRequestToken: token,
      reviewRequestedAt: new Date(),
      reviewRequestExpires: expiresAt,
    },
  });

  const emailCfg = await getTenantEmailConfig(ctx.tenantId);
  const reviewUrl = buildEmailUrl(`/t/psych-review/${token}`);
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  try {
    await resend.emails.send({
      from: emailCfg.from,
      to: parsed.data.reviewerEmail,
      subject: `Revisión de evaluación psicolaboral — ${a.targetName}`,
      text: `Estimado/a ${parsed.data.reviewerName},\n\n${tenant?.name ?? "Una empresa"} solicita tu revisión profesional del informe psicolaboral de ${a.targetName}.\n\nAccede al informe: ${reviewUrl}\n\nEl enlace expira el ${expiresAt.toLocaleDateString("es-CL")}.\n\nGracias.`,
      html: `
        <p>Estimado/a <b>${parsed.data.reviewerName}</b>,</p>
        <p><b>${tenant?.name ?? "Una empresa"}</b> solicita tu revisión profesional del informe psicolaboral de <b>${a.targetName}</b>.</p>
        <p><a href="${reviewUrl}">Acceder al informe y firmar →</a></p>
        <p>El enlace expira el ${expiresAt.toLocaleDateString("es-CL")}.</p>
      `,
      replyTo: emailCfg.replyTo || undefined,
    });
  } catch (err) {
    console.error("[psych/send-to-psych] email failed:", err);
  }

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "psych_result",
    entityId: a.result.id,
    details: {
      event: "psych.review.requested",
      reviewerEmail: parsed.data.reviewerEmail,
      reviewerName: parsed.data.reviewerName,
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    reviewUrl,
    expiresAt,
  });
}
