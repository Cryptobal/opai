/**
 * API Route: /api/chat/unread-counts
 * GET — Return unread count per channel and total for the admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";

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

    // Batch unread counts in a single SQL query
    const unreadMap = await batchUnreadCounts(channelIds, "ADMIN", ctx.userId);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const [channelId, count] of unreadMap) {
      counts[channelId] = count;
      total += count;
    }

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
