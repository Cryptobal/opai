/** POST → sugiere el próximo paso (título de tarea) con IA sobre el hilo. */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { suggestNextStepTask } from "@/modules/crm/email/radar-classify-ai";
import { stripHtml } from "@/modules/crm/email/radar-util";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { threadId } = await params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, subject: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const lastInbound = await prisma.crmEmailMessage.findFirst({
    where: { threadId, tenantId: ctx.tenantId, direction: "in" },
    orderBy: { sentAt: "desc" },
    select: { fromEmail: true, textBody: true, htmlBody: true },
  });
  const body = lastInbound ? (lastInbound.textBody || stripHtml(lastInbound.htmlBody)).trim() : "";
  const title = await suggestNextStepTask({
    tenantId: ctx.tenantId,
    subject: thread.subject,
    fromEmail: lastInbound?.fromEmail ?? "",
    body,
  });
  return NextResponse.json({ title });
}
