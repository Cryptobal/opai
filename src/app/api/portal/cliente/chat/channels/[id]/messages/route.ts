/**
 * API Route: /api/portal/cliente/chat/channels/[id]/messages
 * GET  — List messages with cursor-based pagination for infinite scroll.
 * POST — Send a new message as client.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession, verifyClientChannelAccess } from "@/lib/portal-chat-auth";
import { triggerChatEvent, getSenderId, truncatePreview, getPusherServer } from "@/lib/chat";
import { sendChatPushNotifications, getChatChannelRecipients } from "@/lib/pwa/push-service";
import type { ChatSenderType } from "@prisma/client";

// ── GET — List messages ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: channelId } = await params;

    // Verify client has access to this channel
    const hasAccess = await verifyClientChannelAccess(session.accountId, channelId, session.contactId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const cursor = sp.get("cursor") || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
    const direction = sp.get("direction") === "newer" ? "newer" : "older";

    // Build cursor-based query
    let cursorFilter: any = {};
    if (cursor) {
      const cursorMessage = await prisma.chatMessage.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        cursorFilter = {
          createdAt:
            direction === "older"
              ? { lt: cursorMessage.createdAt }
              : { gt: cursorMessage.createdAt },
        };
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...cursorFilter,
      },
      orderBy: {
        createdAt: direction === "older" ? "desc" : "asc",
      },
      take: limit + 1, // fetch one extra to check hasMore
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

    const hasMore = messages.length > limit;
    const trimmed = hasMore ? messages.slice(0, limit) : messages;

    // Group reactions by emoji
    const data = trimmed.map((msg) => {
      const reactionMap = new Map<
        string,
        { emoji: string; count: number; senders: { id: string; name: string; type: ChatSenderType }[] }
      >();

      for (const r of msg.reactions) {
        const existing = reactionMap.get(r.emoji);
        if (existing) {
          existing.count += 1;
          existing.senders.push({
            id: r.senderId,
            name: r.senderName,
            type: r.senderType,
          });
        } else {
          reactionMap.set(r.emoji, {
            emoji: r.emoji,
            count: 1,
            senders: [
              { id: r.senderId, name: r.senderName, type: r.senderType },
            ],
          });
        }
      }

      return {
        id: msg.id,
        channelId: msg.channelId,
        senderType: msg.senderType,
        senderId: getSenderId(msg),
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
        content: msg.content,
        contentHtml: msg.contentHtml,
        replyTo: msg.replyTo
          ? {
              id: msg.replyTo.id,
              senderName: msg.replyTo.senderName,
              content: truncatePreview(msg.replyTo.content, 100),
            }
          : null,
        attachments: msg.attachments as any[] | null,
        reactions: Array.from(reactionMap.values()),
        systemEventType: msg.systemEventType,
        systemEventData: msg.systemEventData as Record<string, unknown> | null,
        isEdited: msg.isEdited,
        createdAt: msg.createdAt.toISOString(),
      };
    });

    const nextCursor =
      hasMore && trimmed.length > 0
        ? trimmed[trimmed.length - 1].id
        : null;

    return NextResponse.json({
      success: true,
      data,
      meta: { hasMore, nextCursor },
    });
  } catch (err: any) {
    console.error("[Portal Cliente] Error listing chat messages:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ── POST — Send message ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: channelId } = await params;

    // Verify client has access to this channel
    const hasAccess = await verifyClientChannelAccess(session.accountId, channelId, session.contactId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content && !body.attachments?.length) {
      return NextResponse.json(
        { success: false, error: "content es requerido" },
        { status: 400 }
      );
    }

    // Validate replyToId if provided
    const replyToId = typeof body.replyToId === "string" ? body.replyToId : null;
    if (replyToId) {
      const replyTarget = await prisma.chatMessage.findFirst({
        where: { id: replyToId, channelId, deletedAt: null },
        select: { id: true },
      });
      if (!replyTarget) {
        return NextResponse.json(
          { success: false, error: "Mensaje de respuesta no encontrado" },
          { status: 404 }
        );
      }
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments : null;

    // Create message and update channel in a transaction
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          tenantId: session.tenantId,
          channelId,
          senderType: "CLIENT" as ChatSenderType,
          senderContactId: session.contactId,
          senderName: session.contactName,
          content,
          replyToId,
          attachments: attachments ?? undefined,
        },
        include: {
          replyTo: {
            select: { id: true, senderName: true, content: true },
          },
        },
      });

      // Update channel metadata
      await tx.chatChannel.update({
        where: { id: channelId },
        data: {
          lastMessageAt: msg.createdAt,
          lastMessagePreview: truncatePreview(content || "[Archivo adjunto]", 100),
          messageCount: { increment: 1 },
        },
      });

      // Upsert read cursor for the sender (they've read up to this message)
      await tx.chatReadCursor.upsert({
        where: {
          channelId_readerType_readerId: {
            channelId,
            readerType: "CLIENT",
            readerId: session.contactId,
          },
        },
        create: {
          tenantId: session.tenantId,
          channelId,
          readerType: "CLIENT",
          readerId: session.contactId,
          lastReadAt: msg.createdAt,
          lastReadMessageId: msg.id,
        },
        update: {
          lastReadAt: msg.createdAt,
          lastReadMessageId: msg.id,
        },
      });

      return msg;
    });

    const responseData = {
      id: message.id,
      channelId: message.channelId,
      senderType: message.senderType,
      senderId: session.contactId,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar,
      content: message.content,
      contentHtml: message.contentHtml,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            senderName: message.replyTo.senderName,
            content: truncatePreview(message.replyTo.content, 100),
          }
        : null,
      attachments: message.attachments as any[] | null,
      reactions: [],
      systemEventType: message.systemEventType,
      systemEventData: null,
      isEdited: false,
      createdAt: message.createdAt.toISOString(),
    };

    after(async () => {
      // 1. Pusher real-time event
      try {
        await triggerChatEvent(channelId, "new-message", responseData);
      } catch (err) {
        console.error("[Portal Cliente][PUSHER] Error triggering event:", err);
      }

      // Fetch channel info for push + in-app notifications
      const ch = await prisma.chatChannel.findUnique({
        where: { id: channelId },
        select: { name: true, channelType: true },
      });

      // 2. Push notifications
      try {
        await sendChatPushNotifications({
          tenantId: session.tenantId,
          channelId,
          channelName: ch?.name || "Chat",
          channelType: ch?.channelType,
          senderType: "CLIENT",
          senderId: session.contactId,
          senderName: session.contactName,
          messagePreview: content || "[Archivo adjunto]",
          timestamp: message.createdAt.getTime(),
        });
      } catch (err) {
        console.error("[Portal Cliente][PUSH] Error sending push:", err);
      }

      // 3. In-app notifications via Pusher per-user channel
      try {
        const recipients = await getChatChannelRecipients(
          channelId, session.tenantId, "CLIENT", session.contactId
        );
        if (recipients.length > 0) {
          const pusher = getPusherServer();
          const chName = ch?.name || "Chat";
          const notifData = JSON.stringify({
            type: "chat_message",
            channelId,
            channelName: chName,
            senderName: session.contactName,
            messagePreview: (content || "[Archivo adjunto]").substring(0, 120),
            timestamp: new Date().toISOString(),
          });
          const batchEvents = recipients.map((r) => ({
            channel: `private-user-${session.tenantId}-${r.subscriberType}-${r.subscriberId}`,
            name: "in-app-notification",
            data: notifData,
          }));
          for (let i = 0; i < batchEvents.length; i += 10) {
            await pusher.triggerBatch(batchEvents.slice(i, i + 10));
          }
        }
      } catch (err) {
        console.error("[Portal Cliente][PUSHER] Error in-app notifications:", err);
      }
    });

    return NextResponse.json({ success: true, data: responseData });
  } catch (err: any) {
    console.error("[Portal Cliente] Error sending chat message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
