/** POST /api/crm/correos/[threadId]/create-lead — crea el lead (propuesta editada). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { createLeadFromExtraction } from "@/modules/crm/email/email-to-lead-create.service";
import type { CreateLeadMode, LeadExtraction, StagedFile } from "@/modules/crm/email/email-to-lead.types";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const authCtx = await requireAuth();
  if (!authCtx) return unauthorized();
  const forbidden = await requireCrmEdit(authCtx);
  if (forbidden) return forbidden;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId: authCtx.tenantId, userId: authCtx.userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    proposal?: LeadExtraction;
    mode?: CreateLeadMode;
    stagedFiles?: StagedFile[];
  };
  if (!body.proposal) {
    return NextResponse.json({ error: "Falta la propuesta" }, { status: 400 });
  }
  const mode: CreateLeadMode = body.mode === "lead_y_negocio" ? "lead_y_negocio" : "lead";

  const { threadId } = await ctx.params;
  const result = await createLeadFromExtraction({
    tenantId: authCtx.tenantId,
    userId: authCtx.userId,
    emailAccountId: account.id,
    threadId,
    proposal: body.proposal,
    mode,
    stagedFiles: Array.isArray(body.stagedFiles) ? body.stagedFiles : [],
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
