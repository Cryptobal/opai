/** GET → cuentas sugeridas para asociar el hilo (inferencia por dominio). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { suggestAccountsForThread } from "@/modules/crm/email/suggest-account";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { threadId } = await params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  // Ya asociado: sin sugerencias.
  if (thread.accountId) return NextResponse.json({ suggestions: [] });

  const suggestions = await suggestAccountsForThread(ctx.tenantId, threadId);
  return NextResponse.json({ suggestions });
}
