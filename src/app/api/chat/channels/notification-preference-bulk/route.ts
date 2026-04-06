/**
 * API Route: /api/chat/channels/notification-preference-bulk
 * PUT — Set notification preference for multiple channels at once (e.g. all channels in a group).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { z } from "zod";

const VALID_PREFERENCES = ["ALL", "MENTIONS_ONLY", "MUTED"] as const;

const bodySchema = z.object({
  channelIds: z.array(z.string().uuid()).min(1).max(100),
  preference: z.enum(VALID_PREFERENCES),
});

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "channelIds (array de UUIDs) y preference (ALL|MENTIONS_ONLY|MUTED) requeridos" },
        { status: 400 }
      );
    }

    const { channelIds, preference } = parsed.data;

    // Verify all channels exist and belong to tenant
    const channels = await prisma.chatChannel.findMany({
      where: { id: { in: channelIds }, tenantId: ctx.tenantId },
      select: { id: true },
    });
    const validIds = new Set(channels.map((c) => c.id));
    const toUpdate = channelIds.filter((id) => validIds.has(id));

    if (toUpdate.length === 0) {
      return NextResponse.json({ success: false, error: "Ningún canal válido" }, { status: 400 });
    }

    // Upsert preference for each channel
    await Promise.all(
      toUpdate.map((channelId) =>
        prisma.chatNotificationPreference.upsert({
          where: {
            channelId_userType_userId: {
              channelId,
              userType: "ADMIN",
              userId: ctx.userId,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            channelId,
            userType: "ADMIN",
            userId: ctx.userId,
            preference,
          },
          update: { preference },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: { updated: toUpdate.length, preference },
    });
  } catch (err: any) {
    console.error("[Chat] Error bulk notification preference:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
