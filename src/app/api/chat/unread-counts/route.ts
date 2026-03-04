/**
 * API Route: /api/chat/unread-counts
 * GET — Return unread count per channel and total for the admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Get all active channels for this tenant
    const channels = await prisma.chatChannel.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
      },
      select: { id: true },
    });

    const channelIds = channels.map((ch) => ch.id);

    if (channelIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, channels: {} },
      });
    }

    // Fetch all read cursors for this admin in one query
    const readCursors = await prisma.chatReadCursor.findMany({
      where: {
        channelId: { in: channelIds },
        readerType: "ADMIN",
        readerId: ctx.userId,
      },
      select: {
        channelId: true,
        lastReadAt: true,
      },
    });

    const cursorMap = new Map(
      readCursors.map((c) => [c.channelId, c.lastReadAt])
    );

    // Count unread messages per channel
    const counts: Record<string, number> = {};
    let total = 0;

    await Promise.all(
      channelIds.map(async (channelId) => {
        const lastReadAt = cursorMap.get(channelId);
        const count = await prisma.chatMessage.count({
          where: {
            channelId,
            deletedAt: null,
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        counts[channelId] = count;
        total += count;
      })
    );

    return NextResponse.json({
      success: true,
      data: { total, channels: counts },
    });
  } catch (err: any) {
    console.error("Error fetching unread counts:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
