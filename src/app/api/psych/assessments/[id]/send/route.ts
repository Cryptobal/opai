/**
 * POST /api/psych/assessments/[id]/send
 *
 * Body: { channels: ('whatsapp' | 'email' | 'sms' | 'copy-link')[] }
 * Envía el link de invitación usando las plantillas del tenant + tokens.
 * Rate limit: 10 envíos por assessment por día.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MessageTokenContext } from "@/lib/psych/resolveMessageTokens";
import {
  dispatchChannel,
  type ChannelResult,
  type SendConfig,
} from "@/lib/psych/send-channels";

interface Ctx {
  params: Promise<{ id: string }>;
}

const Body = z.object({
  channels: z
    .array(z.enum(["whatsapp", "email", "sms", "copy-link"]))
    .min(1),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const parsed = await parseBody(req, Body);
  if (parsed.error) return parsed.error;

  const rl = checkRateLimit(`psych:send:${id}`, {
    limit: 10,
    windowSeconds: 24 * 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit: máximo 10 envíos por día" },
      { status: 429 },
    );
  }

  const a = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!a) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }

  const [tenantRow, tenantPsychCfg] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    }),
    prisma.tenantPsychConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    }),
  ]);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const tokenCtx: MessageTokenContext = {
    nombre: a.targetName,
    link: `${base}/t/psicotest/${a.invitationToken}`,
    expira: a.expiresAt,
    tenant: tenantRow?.name ?? "Opai",
  };

  const cfg: SendConfig = {
    whatsappTemplate: tenantPsychCfg?.whatsappTemplate ?? null,
    emailSubject: tenantPsychCfg?.emailSubject ?? null,
    emailBody: tenantPsychCfg?.emailBody ?? null,
    smsTemplate: tenantPsychCfg?.smsTemplate ?? null,
  };

  const results: ChannelResult[] = [];
  for (const channel of parsed.data.channels) {
    results.push(
      await dispatchChannel(
        channel,
        ctx.tenantId,
        cfg,
        { email: a.targetEmail, phone: a.targetPhone },
        tokenCtx,
      ),
    );
  }

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "psych_invitation",
    entityId: id,
    details: { event: "psych.invitation.sent", results },
    request: req,
  });

  return NextResponse.json({ success: true, results });
}
