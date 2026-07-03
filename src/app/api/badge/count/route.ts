import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";
import { computeBellUnreadCount } from "@/lib/notifications/bell-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { userId } = ctx;
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

  // Bell unreads — scoped exactly like the notification bell (role/module
  // exclusions, user-muted types, per-user targeting + read state). Counting all
  // tenant notifications here inflated the badge with notifs the user can't see.
  const bell = await computeBellUnreadCount(ctx);

  return NextResponse.json({ chat, bell, total: chat + bell });
}
