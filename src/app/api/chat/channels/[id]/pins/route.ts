/**
 * API Route: /api/chat/channels/[id]/pins
 * GET  — List pinned messages for the channel.
 * POST — Pin a message.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent } from "@/lib/chat";

// ── GET — List pinned messages ──

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const pinnedMessages = await prisma.chatPinnedMessage.findMany({
      where: { channelId },
      include: {
        message: {
          select: {
            id: true,
            senderName: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: { pinnedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: pinnedMessages.map((pm) => ({
        id: pm.id,
        messageId: pm.messageId,
        pinnedBy: pm.pinnedBy,
        pinnedAt: pm.pinnedAt.toISOString(),
        message: {
          id: pm.message.id,
          senderName: pm.message.senderName,
          content: pm.message.content,
          createdAt: pm.message.createdAt.toISOString(),
        },
      })),
    });
  } catch (err: any) {
    console.error("Error listing pinned messages:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ── POST — Pin a message ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;
    const body = await request.json().catch(() => ({}));

    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "messageId es requerido" },
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

    // Verify message exists in channel
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

    // Upsert to handle duplicates gracefully
    const pinRecord = await prisma.chatPinnedMessage.upsert({
      where: {
        channelId_messageId: {
          channelId,
          messageId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        channelId,
        messageId,
        pinnedBy: ctx.userId,
      },
      update: {},
    });

    // Trigger real-time event
    triggerChatEvent(channelId, "message-pinned", {
      messageId,
      pinnedBy: ctx.userId,
    }).catch((err) =>
      console.error("Error triggering message-pinned event:", err)
    );

    return NextResponse.json({
      success: true,
      data: pinRecord,
    });
  } catch (err: any) {
    console.error("Error pinning message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
