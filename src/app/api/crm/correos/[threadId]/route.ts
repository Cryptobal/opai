/** GET /api/crm/correos/[threadId] — detalle de un hilo (cuerpos + adjuntos). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { getCorreoDetail } from "@/modules/crm/email/correos-detail";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
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

  const detail = await getCorreoDetail({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
    threadId,
  });
  if (!detail) {
    return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
