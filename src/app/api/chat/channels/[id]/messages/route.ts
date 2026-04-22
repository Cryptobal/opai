/**
 * API Route: /api/chat/channels/[id]/messages
 * GET  — List messages with cursor-based pagination for infinite scroll.
 * POST — Send a new message.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { triggerChatEvent, getSenderId, truncatePreview, getPusherServer } from "@/lib/chat";
import { sendChatPushNotifications, getChatChannelRecipients, filterRecipientsForInAppNotifications } from "@/lib/pwa/push-service";
import type { ChatSenderType } from "@prisma/client";
import { requireTenantModule } from '@/lib/require-module';

// ── GET — List messages ──

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
    const sp = request.nextUrl.searchParams;
    const cursor = sp.get("cursor") || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
    const direction = sp.get("direction") === "newer" ? "newer" : "older";

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

    // Thread filtering: if threadRootId is provided, show thread replies
    // Otherwise, show only main channel messages (threadRootId IS NULL)
    const threadRootId = sp.get("threadRootId") || null;
    const threadFilter = threadRootId
      ? { threadRootId }
      : { threadRootId: null };

    // Search filtering: search in content and senderName
    const search = sp.get("search") || null;
    const searchFilter = search
      ? {
          OR: [
            { content: { contains: search, mode: "insensitive" as const } },
            { senderName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...threadFilter,
        ...cursorFilter,
        ...searchFilter,
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
        threadRootId: msg.threadRootId,
        replyCount: msg.replyCount,
        lastReplyAt: msg.lastReplyAt?.toISOString() ?? null,
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

    const mentionRegex = /<@([^>]+)>/g;
    const mentionIds = new Set<string>();
    for (const msg of trimmed) {
      let m: RegExpExecArray | null;
      mentionRegex.lastIndex = 0;
      while ((m = mentionRegex.exec(msg.content)) !== null) {
        if (m[1] !== "todos") mentionIds.add(m[1]);
      }
    }
    const mentionDisplayMap: Record<string, string> = {};
    if (mentionIds.size > 0) {
      const ids = [...mentionIds];
      const admins = await prisma.admin.findMany({
        where: { id: { in: ids }, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      for (const a of admins) mentionDisplayMap[a.id] = a.name ?? a.id;
      for (const id of ids) {
        if (mentionDisplayMap[id]) continue;
        const msgWithSender = trimmed.find((m) => getSenderId(m) === id);
        if (msgWithSender?.senderName) mentionDisplayMap[id] = msgWithSender.senderName;
      }
    }

    return NextResponse.json({
      success: true,
      data,
      meta: { hasMore, nextCursor, mentionDisplayMap },
    });
  } catch (err: any) {
    console.error("Error listing chat messages:", err);
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
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;
    const body = await request.json().catch(() => ({}));

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content && !body.attachments?.length) {
      return NextResponse.json(
        { success: false, error: "content es requerido" },
        { status: 400 }
      );
    }

    // Verify channel belongs to tenant
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
      select: { id: true, channelType: true, groupId: true, subType: true, name: true },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    // For GROUP channels, verify admin is a member — except for client-facing
    // system groups (e.g. "Equipo Comercial") which are open to all admins of
    // the tenant.
    if (channel.channelType === "GROUP" && channel.groupId && channel.subType !== "client_facing") {
      const membership = await prisma.adminGroupMembership.findFirst({
        where: { groupId: channel.groupId, adminId: ctx.userId },
      });
      if (!membership) {
        return NextResponse.json(
          { success: false, error: "No eres miembro de este grupo" },
          { status: 403 }
        );
      }
    }

    // Get admin sender name
    const admin = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const senderName = admin?.name ?? ctx.userEmail;

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
    const threadRootId = typeof body.threadRootId === "string" ? body.threadRootId : null;

    // Validate threadRootId if provided
    if (threadRootId) {
      const threadRoot = await prisma.chatMessage.findFirst({
        where: { id: threadRootId, channelId, deletedAt: null, threadRootId: null },
        select: { id: true },
      });
      if (!threadRoot) {
        return NextResponse.json(
          { success: false, error: "Mensaje raíz del hilo no encontrado" },
          { status: 404 }
        );
      }
    }

    // Parse mentions from content: <@userId> and <@todos>
    const mentionRegex = /<@([^>]+)>/g;
    const parsedMentions: { type: string; userId?: string }[] = [];
    let mentionMatch;
    while ((mentionMatch = mentionRegex.exec(content)) !== null) {
      const token = mentionMatch[1];
      if (token === "todos") {
        parsedMentions.push({ type: "ALL" });
      } else {
        parsedMentions.push({ type: "USER", userId: token });
      }
    }

    // Create message and update channel in a transaction
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          tenantId: ctx.tenantId,
          channelId,
          senderType: "ADMIN" as ChatSenderType,
          senderAdminId: ctx.userId,
          senderName,
          content,
          replyToId,
          threadRootId,
          attachments: attachments ?? undefined,
        },
        include: {
          replyTo: {
            select: { id: true, senderName: true, content: true },
          },
        },
      });

      // Create mention records
      if (parsedMentions.length > 0) {
        await tx.chatMention.createMany({
          data: parsedMentions.map((m) => ({
            tenantId: ctx.tenantId,
            messageId: msg.id,
            mentionType: m.type,
            mentionedUserId: m.userId ?? null,
          })),
        });
      }

      // If this is a thread reply, update the root message
      if (threadRootId) {
        await tx.chatMessage.update({
          where: { id: threadRootId },
          data: {
            replyCount: { increment: 1 },
            lastReplyAt: msg.createdAt,
          },
        });
      }

      // Update channel metadata
      await tx.chatChannel.update({
        where: { id: channelId },
        data: {
          lastMessageAt: msg.createdAt,
          lastMessagePreview: truncatePreview(content || "[Archivo adjunto]", 100),
          messageCount: { increment: 1 },
        },
      });

      // Upsert read cursor for the sender
      await tx.chatReadCursor.upsert({
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
      senderId: ctx.userId,
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
      threadRootId: message.threadRootId,
      replyCount: message.replyCount,
      lastReplyAt: message.lastReplyAt?.toISOString() ?? null,
      attachments: message.attachments as any[] | null,
      reactions: [],
      mentions: parsedMentions,
      systemEventType: message.systemEventType,
      systemEventData: null,
      isEdited: false,
      createdAt: message.createdAt.toISOString(),
    };

    after(async () => {
      const mentionedUserIds = parsedMentions
        .map((m) => (m.type === "ALL" ? "todos" : m.userId!))
        .filter(Boolean);

      // 1. Pusher real-time event
      try {
        const eventName = threadRootId ? "thread-reply" : "new-message";
        const eventData = threadRootId
          ? { threadRootId, message: responseData }
          : responseData;
        await triggerChatEvent(channelId, eventName, eventData);
      } catch (err) {
        console.error("[PUSHER] Error triggering chat event:", err);
      }

      // 2. Push notifications
      try {
        const firstImageAttachment = attachments?.find(
          (a: any) =>
            a.type?.startsWith("image/") || a.contentType?.startsWith("image/")
        );

        await sendChatPushNotifications({
          tenantId: ctx.tenantId,
          channelId,
          channelName: channel.name,
          channelType: channel.channelType,
          senderType: "ADMIN",
          senderId: ctx.userId,
          senderName,
          messagePreview: content || "[Archivo adjunto]",
          mentionedUserIds:
            mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          imageUrl: firstImageAttachment?.url || undefined,
          timestamp: message.createdAt.getTime(),
        });
      } catch (err) {
        console.error("[PUSH] Error sending chat push notifications:", err);
      }

      // 3. In-app notifications via Pusher (filter by MENTIONS_ONLY like push)
      try {
        const allRecipients = await getChatChannelRecipients(
          channelId, ctx.tenantId, "ADMIN", ctx.userId
        );
        const recipients = await filterRecipientsForInAppNotifications(
          channelId, allRecipients, mentionedUserIds.length > 0 ? mentionedUserIds : undefined
        );
        if (recipients.length > 0) {
          const pusher = getPusherServer();
          const notifData = JSON.stringify({
            type: "chat_message",
            channelId,
            channelName: channel.name,
            senderName,
            messagePreview: (content || "[Archivo adjunto]").substring(0, 120),
            timestamp: new Date().toISOString(),
          });
          const batchEvents = recipients.map((r) => ({
            channel: `private-user-${ctx.tenantId}-${r.subscriberType}-${r.subscriberId}`,
            name: "in-app-notification",
            data: notifData,
          }));
          for (let i = 0; i < batchEvents.length; i += 10) {
            await pusher.triggerBatch(batchEvents.slice(i, i + 10));
          }
        }
      } catch (err) {
        console.error("[PUSHER] Error sending in-app notifications:", err);
      }
    });

    return NextResponse.json({ success: true, data: responseData });
  } catch (err: any) {
    console.error("Error sending chat message:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ── DELETE — Bulk soft-delete all messages in channel (admin/owner only) ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden limpiar conversaciones" },
        { status: 403 }
      );
    }

    const { id: channelId } = await params;

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

    const result = await prisma.chatMessage.updateMany({
      where: {
        channelId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
      },
    });

    // Trigger Pusher event for connected clients
    triggerChatEvent(channelId, "messages-cleared", {
      clearedBy: ctx.userId,
      count: result.count,
    }).catch((err) =>
      console.error("Error triggering messages-cleared event:", err)
    );

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
    });
  } catch (err: any) {
    console.error("Error clearing channel messages:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
