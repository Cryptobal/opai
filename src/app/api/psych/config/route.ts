/**
 * GET   /api/psych/config — retorna TenantPsychConfig con defaults aplicados.
 * PATCH /api/psych/config — upsert de pesos/umbrales/toggles.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";

const PatchSchema = z.object({
  weightImpulse: z.number().min(0.1).max(3).optional(),
  weightFrustration: z.number().min(0.1).max(3).optional(),
  weightStability: z.number().min(0.1).max(3).optional(),
  weightStress: z.number().min(0.1).max(3).optional(),
  weightAttention: z.number().min(0.1).max(3).optional(),
  weightReasoning: z.number().min(0.1).max(3).optional(),
  weightIntegrity: z.number().min(0.1).max(3).optional(),
  weightResponsibility: z.number().min(0.1).max(3).optional(),
  weightVocational: z.number().min(0).max(3).optional(),
  thresholdFit: z.number().int().min(40).max(100).optional(),
  thresholdCaution: z.number().int().min(20).max(99).optional(),
  requirePsychReview: z.boolean().optional(),
  invitationTTLHours: z.number().int().min(1).max(720).optional(),
  brandLogoUrl: z.string().url().nullable().optional(),
  brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  // Fase 1.5
  reevaluationIntervalMonths: z.number().int().min(1).max(60).optional(),
  whatsappTemplate: z.string().max(1000).nullable().optional(),
  emailSubject: z.string().max(200).nullable().optional(),
  emailBody: z.string().max(5000).nullable().optional(),
  smsTemplate: z.string().max(320).nullable().optional(),
  defaultClientReportLevel: z.enum(["SEAL", "SUMMARY", "FULL"]).optional(),
});

export async function GET() {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;

  const resolved = await resolveTenantPsychConfig(guard.ctx.tenantId);
  const persisted = await prisma.tenantPsychConfig.findUnique({
    where: { tenantId: guard.ctx.tenantId },
  });
  return NextResponse.json({
    success: true,
    config: resolved,
    persisted: !!persisted,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await guardPsych("admin");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const parsed = await parseBody(req, PatchSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  if (
    data.thresholdCaution !== undefined &&
    data.thresholdFit !== undefined &&
    data.thresholdCaution >= data.thresholdFit
  ) {
    return NextResponse.json(
      { success: false, error: "thresholdCaution debe ser menor que thresholdFit" },
      { status: 400 },
    );
  }

  const updated = await prisma.tenantPsychConfig.upsert({
    where: { tenantId: ctx.tenantId },
    create: { tenantId: ctx.tenantId, ...data },
    update: { ...data },
  });

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "psych_config",
    entityId: updated.id,
    details: data as Record<string, unknown>,
    request: req,
  });

  return NextResponse.json({ success: true, config: updated });
}
