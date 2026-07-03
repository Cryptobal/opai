/**
 * API Route: /api/chat/channels/[id]/messages/[messageId]/reactions
 * POST — Toggle reaction on a message. If reaction exists for this user+emoji, remove it.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent } from "@/lib/chat";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId, messageId } = await params;
    const body = await request.json().catch(() => ({}));

    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
    if (!emoji || emoji.length > 32) {
      return NextResponse.json(
        { success: false, error: "emoji es requerido y no debe exceder 32 caracteres" },
        { status: 400 }
      );
    }

    if (/<|>|script/i.test(emoji)) {
      return NextResponse.json(
        { success: false, error: "emoji inválido" },
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

      mirrorReactionInBackground(ctx.tenantId, messageId, emoji, false);

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

      mirrorReactionInBackground(ctx.tenantId, messageId, emoji, true);

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

/** Espeja la reacción en Slack (si el mensaje está puenteado) sin bloquear la respuesta. */
function mirrorReactionInBackground(tenantId: string, messageId: string, emoji: string, added: boolean) {
  after(async () => {
    try {
      const { mirrorReactionToSlack } = await import("@/lib/integrations/slack/reactions");
      await mirrorReactionToSlack(tenantId, messageId, emoji, added);
    } catch (err) {
      console.error("[slack] espejo de reacción a Slack falló:", err);
    }
  });
}
