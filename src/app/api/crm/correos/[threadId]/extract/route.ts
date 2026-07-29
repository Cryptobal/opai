/** POST /api/crm/correos/[threadId]/extract — propuesta de lead por IA (no crea). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { extractLeadFromThread } from "@/modules/crm/email/email-to-lead.service";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

export const maxDuration = 60;

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
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
  const { account } = owned;

  try {
    const result = await extractLeadFromThread({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
      threadId,
    });
    if (!result) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al analizar el correo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
