/** POST → propuesta de negocio a partir del hilo (confirmación humana obligatoria). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { suggestDealForThread } from "@/modules/crm/email/suggest-deal";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
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
  if (!thread.accountId) {
    return NextResponse.json(
      { error: "Asocia una cuenta antes de crear un negocio" },
      { status: 400 },
    );
  }

  const suggestion = await suggestDealForThread(ctx.tenantId, threadId);
  if (!suggestion) {
    return NextResponse.json({ error: "No se pudo generar la propuesta" }, { status: 404 });
  }
  return NextResponse.json({ suggestion });
}
