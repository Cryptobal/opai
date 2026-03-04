/**
 * API Route: /api/chat/channels/[id]/messages/[messageId]
 * PATCH  — Edit message (only own messages).
 * DELETE — Soft-delete message.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent, getSenderId } from "@/lib/chat";

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

// ── PATCH — Edit message ──

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId, messageId } = await params;
    const body = await request.json().catch(() => ({}));

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { success: false, error: "content es requerido" },
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

    // Find message and verify ownership
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        channelId,
        deletedAt: null,
      },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Mensaje no encontrado" },
        { status: 404 }
      );
    }

    // Only the sender can edit their own message
    const senderId = getSenderId(message);
    if (message.senderType !== "ADMIN" || senderId !== ctx.userId) {
      return NextResponse.json(
        { success: false, error: "Solo puedes editar tus propios mensajes" },
        { status: 403 }
      );
    }

    const editedAt = new Date();

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
        editedAt,
      },
    });

    const eventData = {
      id: updated.id,
      content: updated.content,
      editedAt: editedAt.toISOString(),
    };

    // Trigger Pusher event (non-blocking)
    triggerChatEvent(channelId, "message-edited", eventData).catch((err) =>
      console.error("Error triggering message-edited event:", err)
    );

    return NextResponse.json({ success: true, data: eventData });
  } catch (err: any) {
    console.error("Error editing chat message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ── DELETE — Soft-delete message ──

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Find message
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        channelId,
        deletedAt: null,
      },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Mensaje no encontrado" },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
      },
    });

    const eventData = { id: messageId };

    // Trigger Pusher event (non-blocking)
    triggerChatEvent(channelId, "message-deleted", eventData).catch((err) =>
      console.error("Error triggering message-deleted event:", err)
    );

    return NextResponse.json({ success: true, data: eventData });
  } catch (err: any) {
    console.error("Error deleting chat message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
