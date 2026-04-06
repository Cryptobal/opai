/**
 * API Route: /api/chat/channels/[id]/read/cursors
 * GET — Get all read cursors for a channel (who has read up to when).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;

    // Verify channel belongs to tenant
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const cursors = await prisma.chatReadCursor.findMany({
      where: {
        channelId,
        readerType: "ADMIN",
        readerId: { not: ctx.userId },
      },
      select: {
        readerId: true,
        lastReadAt: true,
        lastReadMessageId: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: cursors.map((c) => ({
        readerId: c.readerId,
        lastReadAt: c.lastReadAt.toISOString(),
        lastReadMessageId: c.lastReadMessageId,
      })),
    });
  } catch (err: any) {
    console.error("Error fetching read cursors:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
