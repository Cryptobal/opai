/**
 * POST /api/psych/assessments/[id]/resend — regenera token y expiresAt.
 * Mantiene el mismo assessmentId; invalida token previo (se sobrescribe).
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { signPsychInvitation } from "@/lib/psych/invitation-token";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const ctx = guard.ctx;

  const existing = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }
  if (existing.status === "SUBMITTED" || existing.status === "SCORED" || existing.status === "REVIEWED") {
    return NextResponse.json(
      { success: false, error: "No se puede reenviar una evaluación ya completada" },
      { status: 400 },
    );
  }

  const cfg = await resolveTenantPsychConfig(ctx.tenantId);
  const { token, expiresAt } = await signPsychInvitation(
    { aid: id, tid: ctx.tenantId },
    cfg.invitationTTLHours,
  );

  await prisma.psychAssessment.update({
    where: { id },
    data: {
      invitationToken: token,
      expiresAt,
      status: "PENDING",
    },
  });

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "psych_assessment",
    entityId: id,
    details: { operation: "resend" },
    request: req,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    success: true,
    token,
    expiresAt,
    url: `${base}/t/psicotest/${token}`,
  });
}
