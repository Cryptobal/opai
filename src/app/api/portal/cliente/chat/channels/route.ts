/**
 * API Route: /api/portal/cliente/chat/channels
 * GET — List all channels for the client's account installations.
 *        Includes installation name, account name, and unread count.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Find all installations for the client's account
    const installations = await prisma.crmInstallation.findMany({
      where: {
        accountId: session.accountId,
        tenantId: session.tenantId,
      },
      select: { id: true },
    });

    const installationIds = installations.map((i) => i.id);

    if (installationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0 },
      });
    }

    const channels = await prisma.chatChannel.findMany({
      where: {
        tenantId: session.tenantId,
        isActive: true,
        installationId: { in: installationIds },
      },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      include: {
        installation: {
          select: {
            id: true,
            name: true,
            account: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Fetch read cursors for this client in one query
    const channelIds = channels.map((ch) => ch.id);

    const readCursors = await prisma.chatReadCursor.findMany({
      where: {
        channelId: { in: channelIds },
        readerType: "CLIENT",
        readerId: session.contactId,
      },
      select: {
        channelId: true,
        lastReadAt: true,
      },
    });

    const cursorMap = new Map(
      readCursors.map((c) => [c.channelId, c.lastReadAt])
    );

    // Compute unread counts per channel
    const unreadCounts = await Promise.all(
      channels.map(async (ch) => {
        const lastReadAt = cursorMap.get(ch.id);
        const count = await prisma.chatMessage.count({
          where: {
            channelId: ch.id,
            deletedAt: null,
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        return { channelId: ch.id, count };
      })
    );

    const unreadMap = new Map(
      unreadCounts.map((u) => [u.channelId, u.count])
    );

    const data = channels.map((ch) => ({
      id: ch.id,
      tenantId: ch.tenantId,
      installationId: ch.installationId,
      name: ch.name,
      isActive: ch.isActive,
      lastMessageAt: ch.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: ch.lastMessagePreview,
      messageCount: ch.messageCount,
      createdAt: ch.createdAt.toISOString(),
      updatedAt: ch.updatedAt.toISOString(),
      installation: ch.installation
        ? {
            id: ch.installation.id,
            name: ch.installation.name,
            account: ch.installation.account
              ? { id: ch.installation.account.id, name: ch.installation.account.name }
              : null,
          }
        : undefined,
      unreadCount: unreadMap.get(ch.id) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (err: any) {
    console.error("[Portal Cliente] Error listing chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
