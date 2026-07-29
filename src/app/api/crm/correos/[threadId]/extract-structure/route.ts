/** POST /api/crm/correos/[threadId]/extract-structure — propuesta CRM+cobertura (no crea). */
import { NextRequest, NextResponse } from "next/server";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  buildCoverageTable,
  extractCrmStructureFromThread,
} from "@/modules/crm/email/email-to-crm-structure.service";
import { parseExtractStructureBody } from "@/modules/crm/email/extract-structure-body";
import { logAiUsage } from "@/lib/platform-ai-service";
import { aiService } from "@/lib/ai-service";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

export const maxDuration = 60;

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;

  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso de Copiloto de correos" }, { status: 403 });
  }

  let body: unknown = undefined;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
  }

  const parsed = parseExtractStructureBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { threadId } = await ctx.params;
  const owned = await requireThreadMailbox({
    tenantId: authCtx.tenantId,
    userId: authCtx.userId,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const isRefine = Boolean(parsed.answers?.length);
  const startedAt = Date.now();
  try {
    const result = await extractCrmStructureFromThread({
      tenantId: authCtx.tenantId,
      emailAccountId: account.id,
      threadId,
      answers: parsed.answers,
      baseProposal: parsed.baseProposal,
      locks: parsed.locks,
    });
    if (!result) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

    const feature = isRefine ? "correo-refine-structure" : "correo-extract-structure";
    const active = await aiService.getActiveConfig?.({
      tenantId: authCtx.tenantId,
      feature,
    });
    logAiUsage({
      tenantId: authCtx.tenantId,
      providerType: active?.providerType ?? "openai",
      model: active?.modelId ?? "json-default",
      feature,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startedAt,
      metadata: {
        threadId,
        attachmentCount: result.stagedFiles.length,
        sources: result.sources.length,
        command: true,
        refineAnswers: parsed.answers?.length ?? 0,
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
