import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET → usuarios Slack vinculados a Admins + estado allowWrites del asistente. */
export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId } = auth.ctx;

  const links = await prisma.slackUserLink.findMany({
    where: { tenantId },
    orderBy: { linkedAt: "desc" },
    select: { id: true, slackUserId: true, slackEmail: true, adminId: true, linkedAt: true },
  });

  const adminIds = links.map((l) => l.adminId);
  const admins = adminIds.length
    ? await prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } })
    : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a]));

  const items = links.map((l) => ({
    id: l.id,
    slackUserId: l.slackUserId,
    slackEmail: l.slackEmail,
    adminName: adminMap[l.adminId]?.name ?? "(desconocido)",
    adminEmail: adminMap[l.adminId]?.email ?? null,
    linkedAt: l.linkedAt.toISOString(),
  }));

  const cfg = await getAiHelpChatConfig(tenantId);
  return NextResponse.json({ success: true, items, allowWrites: cfg.allowWrites });
}

/** DELETE ?id=<linkId> → desvincula un usuario Slack (scoped al tenant). */
export async function DELETE(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });

  const result = await prisma.slackUserLink.deleteMany({ where: { id, tenantId } });
  if (result.count === 0) {
    return NextResponse.json({ success: false, error: "Vínculo no encontrado" }, { status: 404 });
  }

  await logAudit({
    action: "DELETE",
    entity: "SlackUserLink",
    entityId: id,
    tenantId,
    userId,
    details: { via: "panel" },
  });

  return NextResponse.json({ success: true });
}
