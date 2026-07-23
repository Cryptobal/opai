/**
 * POST /api/crm/correos/[threadId]/summary (A01/A02):
 * body { mode: "full" | "since-read" } → resumen del hilo (full cacheado por
 * último mensaje) o de lo nuevo desde la última lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { summarizeThread } from "@/modules/crm/email/email-summary.service";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "since-read" ? "since-read" : "full";

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  }

  const result = await summarizeThread({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
    threadId,
    mode,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
