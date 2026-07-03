import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { UNIFIED_NOTIFICATION_TYPES } from "@/lib/notifications/catalog";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET → estado de la conexión + ruteo + catálogo resumido para la UI. */
export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId } = auth.ctx;

  const ws = await prisma.slackWorkspace.findUnique({ where: { tenantId } });
  const connected = !!ws && ws.status === "ACTIVE";

  const routes = connected
    ? await prisma.slackChannelRoute.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, matchType: true, matchValue: true,
          channelId: true, channelName: true, enabled: true,
        },
      })
    : [];

  const notifTypes = UNIFIED_NOTIFICATION_TYPES.map((t) => ({
    key: t.key, label: t.label, module: t.module, category: t.category,
  }));

  return NextResponse.json({
    success: true,
    connected,
    teamName: ws?.teamName ?? null,
    botUserId: ws?.botUserId ?? null,
    defaultChannel:
      ws?.defaultChannelId
        ? { id: ws.defaultChannelId, name: ws.defaultChannelName ?? ws.defaultChannelId }
        : null,
    routes,
    notifTypes,
  });
}

/** DELETE → desconectar: status REVOKED + audit. No borra filas. */
export async function DELETE(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  const ws = await prisma.slackWorkspace.findUnique({ where: { tenantId } });
  if (!ws) return NextResponse.json({ success: false, error: "No hay workspace conectado" }, { status: 404 });

  await prisma.slackWorkspace.update({ where: { tenantId }, data: { status: "REVOKED" } });
  await logAudit({
    action: "UPDATE",
    entity: "SlackWorkspace",
    entityId: ws.slackTeamId,
    tenantId,
    userId,
    details: { reason: "disconnected_by_admin" },
    request: req,
  });

  return NextResponse.json({ success: true });
}
