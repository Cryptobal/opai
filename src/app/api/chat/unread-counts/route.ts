/**
 * API Route: /api/chat/unread-counts
 * GET — Return unread count per channel and total for the admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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

    // Fetch notification preferences to exclude MUTED/MENTIONS_ONLY from total
    const notifPrefs = channelIds.length > 0
      ? await prisma.chatNotificationPreference.findMany({
          where: {
            channelId: { in: channelIds },
            userType: "ADMIN",
            userId: ctx.userId,
            preference: { in: ["MUTED", "MENTIONS_ONLY"] },
          },
          select: { channelId: true },
        })
      : [];
    const excludedFromTotal = new Set(notifPrefs.map((p) => p.channelId));

    const counts: Record<string, number> = {};
    let total = 0;
    for (const [channelId, count] of unreadMap) {
      counts[channelId] = count;
      if (!excludedFromTotal.has(channelId)) {
        total += count;
      }
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
