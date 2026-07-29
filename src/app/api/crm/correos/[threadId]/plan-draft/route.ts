/** PUT/DELETE /api/crm/correos/[threadId]/plan-draft — borrador del plan editable. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  clearPlanDraft,
  getPlanDraft,
  savePlanDraft,
} from "@/modules/crm/email/plan-draft";
import type { AiPlanDraft } from "@/modules/crm/email/email-to-crm-structure.types";

type Ctx = { params: Promise<{ threadId: string }> };

async function resolveAccount(tenantId: string, userId: string) {
  return prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;
  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso de Copiloto de correos" }, { status: 403 });
  }
  const account = await resolveAccount(authCtx.tenantId, authCtx.userId);
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
  const draft = await getPlanDraft({
    tenantId: authCtx.tenantId,
    threadId,
    emailAccountId: account.id,
  });
  return NextResponse.json({ draft });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;
  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso de Copiloto de correos" }, { status: 403 });
  }
  const account = await resolveAccount(authCtx.tenantId, authCtx.userId);
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Partial<AiPlanDraft>;
  if (!body.proposal || !body.include) {
    return NextResponse.json({ error: "Faltan proposal e include" }, { status: 400 });
  }

  const { threadId } = await ctx.params;
  const result = await savePlanDraft({
    tenantId: authCtx.tenantId,
    threadId,
    emailAccountId: account.id,
    draft: {
      proposal: body.proposal,
      include: body.include,
      locks: Array.isArray(body.locks) ? body.locks : [],
      taskOverride: body.taskOverride,
      attachmentSelection: body.attachmentSelection,
      quoteInput: body.quoteInput,
      milestones: body.milestones,
      lastMessageId: body.lastMessageId ?? null,
    },
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("256") ? 413 : 404 },
    );
  }
  return NextResponse.json({ ok: true, savedAt: result.savedAt });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;
  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso de Copiloto de correos" }, { status: 403 });
  }
  const account = await resolveAccount(authCtx.tenantId, authCtx.userId);
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
  await clearPlanDraft({
    tenantId: authCtx.tenantId,
    threadId,
    emailAccountId: account.id,
  });
  return NextResponse.json({ ok: true });
}
