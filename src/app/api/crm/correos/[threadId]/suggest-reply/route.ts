/** GET → borrador existente del radar; POST → genera borrador on-demand (IA). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { generateDraftReply } from "@/modules/crm/email/radar-classify-ai";
import { stripHtml } from "@/modules/crm/email/radar-util";

export const maxDuration = 60;
type Ctx = { params: Promise<{ threadId: string }> };

async function loadThreadReply(tenantId: string, threadId: string) {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: { id: true, subject: true },
  });
  if (!thread) return null;
  const [lastInbound, radar] = await Promise.all([
    prisma.crmEmailMessage.findFirst({
      where: { threadId, tenantId, direction: "in" },
      orderBy: { sentAt: "desc" },
      select: { fromEmail: true, textBody: true, htmlBody: true },
    }),
    prisma.crmRadarItem.findFirst({
      where: { tenantId, threadId, kind: "nuevo_lead" },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true },
    }),
  ]);
  return { thread, lastInbound, radar };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;
  const data = await loadThreadReply(ctx.tenantId, threadId);
  if (!data) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  const payload = (data.radar?.payload as Record<string, unknown> | null) ?? {};
  const draft = typeof payload.draftReply === "string" ? payload.draftReply : null;
  return NextResponse.json({
    draft,
    radarItemId: data.radar?.id ?? null,
    to: data.lastInbound?.fromEmail ?? null,
    subject: data.thread.subject,
  });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;
  const data = await loadThreadReply(ctx.tenantId, threadId);
  if (!data?.lastInbound) return NextResponse.json({ error: "Sin correo entrante" }, { status: 404 });
  const body = (data.lastInbound.textBody || stripHtml(data.lastInbound.htmlBody)).trim();
  const draft = await generateDraftReply({
    tenantId: ctx.tenantId,
    subject: data.thread.subject,
    fromEmail: data.lastInbound.fromEmail,
    body,
    resumen: "",
  });
  return NextResponse.json({ draft, to: data.lastInbound.fromEmail });
}
