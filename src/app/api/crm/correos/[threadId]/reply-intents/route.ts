/**
 * POST /api/crm/correos/[threadId]/reply-intents
 * → { intents: [{ id, label, hint }] (3), cached: boolean }
 *
 * On-demand (chip "Sugerir respuestas" del lector). Cacheado por último
 * mensaje del hilo: reabrir sin novedades responde `cached: true` sin costo
 * de modelo. Mismo alcance que el resto del módulo: casilla del usuario.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { AIError, AI_ERROR_USER_MESSAGES } from "@/lib/ai-errors";
import { generateReplyIntents } from "@/modules/crm/email/reply-intents.service";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { threadId } = await ctx.params;

  const owned = await requireThreadMailbox({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });

  try {
    const result = await generateReplyIntents({
      tenantId: session.user.tenantId,
      emailAccountId: owned.account.id,
      threadId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ intents: result.intents, cached: result.cached });
  } catch (error) {
    if (error instanceof AIError) {
      const friendly = AI_ERROR_USER_MESSAGES[error.code];
      return NextResponse.json(
        {
          ...error.toResponse(),
          error: friendly?.description || error.message,
          title: friendly?.title,
        },
        { status: error.clientHttpStatus },
      );
    }
    console.error("[correos] reply-intents failed:", error);
    return NextResponse.json(
      { error: "No se pudieron sugerir respuestas. Reintentá en unos segundos." },
      { status: 500 },
    );
  }
}
