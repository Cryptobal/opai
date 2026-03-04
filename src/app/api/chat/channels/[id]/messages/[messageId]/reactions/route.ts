/**
 * API Route: /api/chat/channels/[id]/messages/[messageId]/reactions
 * POST — Toggle reaction on a message. If reaction exists for this user+emoji, remove it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent } from "@/lib/chat";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId, messageId } = await params;
    const body = await request.json().catch(() => ({}));

    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
    if (!emoji) {
      return NextResponse.json(
        { success: false, error: "emoji es requerido" },
        { status: 400 }
      );
    }

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

    // Verify message exists
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId, deletedAt: null },
      select: { id: true },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Mensaje no encontrado" },
        { status: 404 }
      );
    }

    // Get admin name
    const admin = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const senderName = admin?.name ?? ctx.userEmail;

    // Check if reaction already exists (toggle logic)
    const existing = await prisma.chatMessageReaction.findUnique({
      where: {
        messageId_senderId_emoji: {
          messageId,
          senderId: ctx.userId,
          emoji,
        },
      },
    });

    if (existing) {
      // Remove reaction
      await prisma.chatMessageReaction.delete({
        where: { id: existing.id },
      });

      const eventData = {
        messageId,
        emoji,
        senderId: ctx.userId,
        senderName,
        senderType: "ADMIN" as const,
      };

      triggerChatEvent(channelId, "reaction-removed", eventData).catch((err) =>
        console.error("Error triggering reaction-removed event:", err)
      );

      return NextResponse.json({
        success: true,
        data: { action: "removed", ...eventData },
      });
    } else {
      // Add reaction
      const reaction = await prisma.chatMessageReaction.create({
        data: {
          tenantId: ctx.tenantId,
          messageId,
          senderType: "ADMIN",
          senderId: ctx.userId,
          senderName,
          emoji,
        },
      });

      const eventData = {
        messageId,
        emoji,
        senderId: ctx.userId,
        senderName,
        senderType: "ADMIN" as const,
      };

      triggerChatEvent(channelId, "reaction-added", eventData).catch((err) =>
        console.error("Error triggering reaction-added event:", err)
      );

      return NextResponse.json({
        success: true,
        data: { action: "added", id: reaction.id, ...eventData },
      });
    }
  } catch (err: any) {
    console.error("Error toggling chat reaction:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
