/** POST /api/crm/correos/[threadId]/extract — propuesta de lead por IA (no crea). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { extractLeadFromThread } from "@/modules/crm/email/email-to-lead.service";

export const maxDuration = 60;

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId: session.user.tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
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
