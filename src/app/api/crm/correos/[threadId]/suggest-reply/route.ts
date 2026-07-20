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
    prisma.crmRadarItem.findMany({
      where: { tenantId, threadId, kind: { in: ["nuevo_lead", "compromiso"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, payload: true },
    }),
  ]);
  return { thread, lastInbound, radars: radar };
}

/** Extrae el primer borrador disponible (draftReply | draftFollowUp) + su id. */
function pickDraft(radars: { id: string; payload: unknown }[]): { draft: string | null; radarItemId: string | null } {
  for (const r of radars) {
    const p = (r.payload as Record<string, unknown> | null) ?? {};
    const d =
      (typeof p.draftReply === "string" && p.draftReply) ||
      (typeof p.draftFollowUp === "string" && p.draftFollowUp) ||
      null;
    if (d) return { draft: d as string, radarItemId: r.id };
  }
  return { draft: null, radarItemId: radars[0]?.id ?? null };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;
  const data = await loadThreadReply(ctx.tenantId, threadId);
  if (!data) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  const { draft, radarItemId } = pickDraft(data.radars);
  return NextResponse.json({
    draft,
    radarItemId,
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
