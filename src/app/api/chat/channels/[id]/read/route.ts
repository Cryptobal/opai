/**
 * API Route: /api/chat/channels/[id]/read
 * POST — Update read cursor for the admin user.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;
    const body = await request.json().catch(() => ({}));

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

    const lastReadMessageId =
      typeof body.lastReadMessageId === "string"
        ? body.lastReadMessageId
        : null;

    // Determine the lastReadAt timestamp
    let lastReadAt = new Date();

    if (lastReadMessageId) {
      const msg = await prisma.chatMessage.findFirst({
        where: { id: lastReadMessageId, channelId },
        select: { createdAt: true },
      });
      if (msg) {
        lastReadAt = msg.createdAt;
      }
    }

    // Upsert the read cursor
    const cursor = await prisma.chatReadCursor.upsert({
      where: {
        channelId_readerType_readerId: {
          channelId,
          readerType: "ADMIN",
          readerId: ctx.userId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        channelId,
        readerType: "ADMIN",
        readerId: ctx.userId,
        lastReadAt,
        lastReadMessageId,
      },
      update: {
        lastReadAt,
        lastReadMessageId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        channelId: cursor.channelId,
        lastReadAt: cursor.lastReadAt.toISOString(),
        lastReadMessageId: cursor.lastReadMessageId,
      },
    });
  } catch (err: any) {
    console.error("Error updating read cursor:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
