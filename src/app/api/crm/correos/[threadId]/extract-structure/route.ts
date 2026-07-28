/** POST /api/crm/correos/[threadId]/extract-structure — propuesta CRM+cobertura (no crea). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  buildCoverageTable,
  extractCrmStructureFromThread,
} from "@/modules/crm/email/email-to-crm-structure.service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { aiService } from "@/lib/ai-service";

export const maxDuration = 60;

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;

  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "radar_comercial")) {
    return NextResponse.json({ error: "Sin permiso de Radar Comercial" }, { status: 403 });
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: authCtx.tenantId,
      userId: authCtx.userId,
      provider: "gmail",
      status: "active",
    },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
  const startedAt = Date.now();
  try {
    const result = await extractCrmStructureFromThread({
      tenantId: authCtx.tenantId,
      emailAccountId: account.id,
      threadId,
    });
    if (!result) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

    const active = await aiService.getActiveConfig?.({
      tenantId: authCtx.tenantId,
      feature: "correo-extract-structure",
    });
    logAiUsage({
      tenantId: authCtx.tenantId,
      providerType: active?.providerType ?? "openai",
      model: active?.modelId ?? "json-default",
      feature: "correo-extract-structure",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startedAt,
      metadata: {
        threadId,
        attachmentCount: result.stagedFiles.length,
        sources: result.sources.length,
        command: true,
      },
    });

    return NextResponse.json({
      proposal: result.proposal,
      stagedFiles: result.stagedFiles,
      sources: result.sources,
      coverageTable: buildCoverageTable(result.proposal),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al analizar el correo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
