import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { sendSignatureReminderEmail } from "@/lib/docs-signature-email";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { trackingRemindSchema } from "@/lib/validations/docs";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesEdit(ctx);
  if (forbidden) return forbidden;
  const rl = checkRateLimit(`laborales-remind:${ctx.tenantId}`, { limit: 20, windowSeconds: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Demasiados recordatorios" }, { status: 429 });
  }
  const parsed = await parseBody(request, trackingRemindSchema);
  if (parsed.error) return parsed.error;

  let recipientIds: string[] = [];
  if (parsed.data.recipientId) {
    recipientIds = [parsed.data.recipientId];
  } else if (parsed.data.campaignId) {
    const campaign = await prisma.docBulkCampaign.findFirst({
      where: { id: parsed.data.campaignId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaña no encontrada" }, { status: 404 });
    }
    const items = await prisma.docBulkCampaignItem.findMany({
      where: { campaignId: campaign.id, tenantId: ctx.tenantId, status: "sent", documentId: { not: null } },
      select: { documentId: true },
      take: 200,
    });
    const docs = items.map((i) => i.documentId).filter((id): id is string => Boolean(id));
    const pending = await prisma.docSignatureRecipient.findMany({
      where: {
        status: { in: ["pending", "sent", "viewed"] },
        request: { tenantId: ctx.tenantId, documentId: { in: docs } },
      },
      select: { id: true },
      take: 80,
    });
    recipientIds = pending.map((r) => r.id);
  }

  const recipients = await prisma.docSignatureRecipient.findMany({
    where: { id: { in: recipientIds }, request: { tenantId: ctx.tenantId } },
    include: { request: { include: { document: { select: { title: true } } } } },
  });

  const siteUrl = getCanonicalSiteUrl();
  let sent = 0;
  for (const recipient of recipients) {
    const result = await sendSignatureReminderEmail({
      to: recipient.email,
      recipientName: recipient.name,
      documentTitle: recipient.request.document.title,
      signingUrl: `${siteUrl}/sign/${recipient.token}`,
    });
    if (result.ok) sent += 1;
  }
  return NextResponse.json({ success: true, data: { sent } });
}
