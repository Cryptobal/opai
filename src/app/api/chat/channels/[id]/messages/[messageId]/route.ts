/**
 * API Route: /api/chat/channels/[id]/messages/[messageId]
 * GET    — Fetch single message by ID.
 * PATCH  — Edit message (only own messages).
 * DELETE — Soft-delete message.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canDelete } from "@/lib/permissions";
import { triggerChatEvent, getSenderId, truncatePreview } from "@/lib/chat";
import { requireTenantModule } from '@/lib/require-module';

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

// ── GET — Fetch single message ──

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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

    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        channelId,
        deletedAt: null,
      },
      include: {
        reactions: {
          select: {
            id: true,
            emoji: true,
            senderId: true,
            senderName: true,
            senderType: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            senderName: true,
            content: true,
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Mensaje no encontrado" },
        { status: 404 }
      );
    }

    // Format the message to match ChatMessageData (same shape as list endpoint)
    const formatted = {
      id: message.id,
      channelId: message.channelId,
      senderType: message.senderType,
      senderId: getSenderId(message),
      senderName: message.senderName,
      senderAvatar: message.senderAvatar,
      content: message.content,
      contentHtml: message.contentHtml,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            senderName: message.replyTo.senderName,
            content: message.replyTo.content,
          }
        : null,
      threadRootId: message.threadRootId,
      replyCount: message.replyCount,
      lastReplyAt: message.lastReplyAt?.toISOString() ?? null,
      attachments: message.attachments as any[] | null,
      reactions: Array.from(
        message.reactions
          .reduce(
            (map, r) => {
              const existing = map.get(r.emoji);
              if (existing) {
                existing.count += 1;
                existing.senders.push({ id: r.senderId, name: r.senderName, type: r.senderType });
              } else {
                map.set(r.emoji, {
                  emoji: r.emoji,
                  count: 1,
                  senders: [{ id: r.senderId, name: r.senderName, type: r.senderType }],
                });
              }
              return map;
            },
            new Map<string, { emoji: string; count: number; senders: { id: string; name: string; type: string }[] }>()
          )
          .values()
      ),
      systemEventType: message.systemEventType,
      systemEventData: message.systemEventData as Record<string, unknown> | null,
      isEdited: message.isEdited,
      createdAt: message.createdAt.toISOString(),
    };

    return NextResponse.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error("Error fetching chat message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ── PATCH — Edit message ──

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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

    // Only sender can delete their own message, unless user has hub delete permission
    const isOwnMessage = message.senderType === "ADMIN" && message.senderAdminId === ctx.userId;
    const perms = await resolveApiPerms(ctx);
    const canDeleteAnyMessage = canDelete(perms, "hub");

    if (!isOwnMessage && !canDeleteAnyMessage) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para eliminar este mensaje" },
        { status: 403 }
      );
    }

    // Soft delete + recompute channel summary in a single transaction so that
    // lastMessagePreview / lastMessageAt / messageCount stay consistent.
    const { lastMessagePreview, lastMessageAt, messageCount } = await prisma.$transaction(async (tx) => {
      await tx.chatMessage.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.userId,
        },
      });

      const latest = await tx.chatMessage.findFirst({
        where: {
          channelId,
          deletedAt: null,
          threadRootId: null,
        },
        orderBy: { createdAt: "desc" },
        select: { content: true, attachments: true, createdAt: true },
      });

      const nextPreview = latest
        ? truncatePreview(latest.content || "[Archivo adjunto]", 100)
        : null;
      const nextLastMessageAt = latest?.createdAt ?? null;

      const updatedChannel = await tx.chatChannel.update({
        where: { id: channelId },
        data: {
          lastMessagePreview: nextPreview,
          lastMessageAt: nextLastMessageAt,
          messageCount: { decrement: 1 },
        },
        select: { messageCount: true },
      });

      return {
        lastMessagePreview: nextPreview,
        lastMessageAt: nextLastMessageAt,
        messageCount: updatedChannel.messageCount,
      };
    });

    const eventData = {
      id: messageId,
      channelId,
      lastMessagePreview,
      lastMessageAt: lastMessageAt?.toISOString() ?? null,
      messageCount,
    };

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
