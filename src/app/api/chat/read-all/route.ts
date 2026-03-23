/**
 * API Route: /api/chat/read-all
 * POST — Mark all channels as read for the current admin user.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { syncBadgeAcrossDevices } from "@/lib/pwa/push-service";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Get all channels the admin has access to (same logic as GET /api/chat/channels)
    const memberships = await prisma.adminGroupMembership.findMany({
      where: { adminId: ctx.userId },
      select: { groupId: true },
    });
    const memberGroupIds = memberships.map((m) => m.groupId);

    const allChannels = await prisma.chatChannel.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        OR: [
          { channelType: "INSTALLATION", installation: { chatEnabled: true } },
          { channelType: "GROUP", groupId: { in: memberGroupIds } },
          { channelType: "DIRECT", dmParticipants: { some: { adminId: ctx.userId } } },
          { channelType: "EXTERNAL", participants: { some: { participantType: "ADMIN", participantId: ctx.userId } } },
        ],
      },
      select: { id: true },
    });

    const archivedSet = new Set(
      (
        await prisma.chatChannelArchive.findMany({
          where: {
            adminId: ctx.userId,
            channelId: { in: allChannels.map((c) => c.id) },
          },
          select: { channelId: true },
        })
      ).map((a) => a.channelId)
    );

    const channelIds = allChannels
      .filter((c) => !archivedSet.has(c.id))
      .map((c) => c.id);

    if (channelIds.length === 0) {
      return NextResponse.json({ success: true, data: { updated: 0 } });
    }

    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO chat.read_cursors (id, tenant_id, channel_id, reader_type, reader_id, last_read_at)
      SELECT uuid_generate_v4(), ${ctx.tenantId}, cid, 'ADMIN', ${ctx.userId}, ${now}
      FROM UNNEST(${channelIds}::uuid[]) AS cid
      ON CONFLICT (channel_id, reader_type, reader_id)
      DO UPDATE SET last_read_at = EXCLUDED.last_read_at
    `;

    // Sync badge to other devices in the background (fire-and-forget)
    syncBadgeAcrossDevices(ctx.tenantId, 'admin', ctx.userId).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { updated: channelIds.length },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/chat/read-all] Error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
