import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { tenantId, userId } = ctx;
  const senderType = "ADMIN";

  // Chat unreads — only channels with read cursors, excluding MUTED/MENTIONS_ONLY.
  const cursors = await prisma.chatReadCursor.findMany({
    where: { readerType: senderType, readerId: userId },
    select: { channelId: true },
  });
  const channelIds = cursors.map((c) => c.channelId);

  let chat = 0;
  if (channelIds.length > 0) {
    const muted = await prisma.chatNotificationPreference.findMany({
      where: {
        channelId: { in: channelIds },
        userType: senderType,
        userId,
        preference: { in: ["MUTED", "MENTIONS_ONLY"] },
      },
      select: { channelId: true },
    });
    const mutedSet = new Set(muted.map((m) => m.channelId));
    const includeIds = channelIds.filter((id) => !mutedSet.has(id));
    if (includeIds.length > 0) {
      const counts = await batchUnreadCounts(includeIds, senderType, userId, true);
      for (const c of counts.values()) chat += c;
    }
  }

  // Bell unreads — per-user via NotificationReadState; targeted notifs use data.targetUserId.
  const allNotifs = await prisma.notification.findMany({
    where: { tenantId },
    select: { id: true, read: true, data: true },
  });
  let bell = 0;
  if (allNotifs.length > 0) {
    const readRows = await prisma.notificationReadState.findMany({
      where: {
        userId,
        notificationId: { in: allNotifs.map((n) => n.id) },
      },
      select: { notificationId: true },
    });
    const readSet = new Set(readRows.map((r) => r.notificationId));
    bell = allNotifs.filter((n) => {
      const d = (n.data as Record<string, unknown> | null) ?? {};
      const tu = typeof d.targetUserId === "string" ? d.targetUserId : null;
      if (tu) return tu === userId && !n.read;
      return !readSet.has(n.id);
    }).length;
  }

  return NextResponse.json({ chat, bell, total: chat + bell });
}
