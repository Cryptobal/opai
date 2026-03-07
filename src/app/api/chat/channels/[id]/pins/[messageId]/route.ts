/**
 * API Route: /api/chat/channels/[id]/pins/[messageId]
 * DELETE — Unpin a message.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent } from "@/lib/chat";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId, messageId } = await params;

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

    // Delete the pin (ignore if doesn't exist)
    await prisma.chatPinnedMessage.deleteMany({
      where: { channelId, messageId },
    });

    // Trigger real-time event
    triggerChatEvent(channelId, "message-unpinned", {
      messageId,
      unpinnedBy: ctx.userId,
    }).catch((err) =>
      console.error("Error triggering message-unpinned event:", err)
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error unpinning message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
