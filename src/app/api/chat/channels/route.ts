/**
 * API Route: /api/chat/channels
 * GET — List channels for admin's tenant, sorted by lastMessageAt DESC.
 *        Supports ?type=GROUP|INSTALLATION (default: all).
 *        GROUP channels filtered by admin's group membership.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search")?.trim() || "";
    const typeFilter = sp.get("type")?.toUpperCase() || "";

    // Build where clause
    const where: any = {
      tenantId: ctx.tenantId,
      isActive: true,
    };

    // Get group memberships for GROUP channel filtering
    const memberships = await prisma.adminGroupMembership.findMany({
      where: { adminId: ctx.userId },
      select: { groupId: true },
    });
    const memberGroupIds = memberships.map((m) => m.groupId);

    if (typeFilter === "GROUP") {
      where.channelType = "GROUP";
      where.groupId = { in: memberGroupIds };
    } else if (typeFilter === "INSTALLATION") {
      where.channelType = "INSTALLATION";
    } else {
      // Show installation channels + only group channels the user belongs to
      where.OR = [
        { channelType: "INSTALLATION" },
        { channelType: "GROUP", groupId: { in: memberGroupIds } },
      ];
    }

    if (search) {
      const searchConditions = [
        { name: { contains: search, mode: "insensitive" as const } },
        {
          installation: {
            name: { contains: search, mode: "insensitive" as const },
          },
        },
        {
          installation: {
            account: {
              name: { contains: search, mode: "insensitive" as const },
            },
          },
        },
      ];

      if (where.OR) {
        const existingOR = where.OR;
        delete where.OR;
        where.AND = [{ OR: existingOR }, { OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    const channels = await prisma.chatChannel.findMany({
      where,
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

    // Fetch read cursors for this admin in one query
    const channelIds = channels.map((ch) => ch.id);

    const readCursors = await prisma.chatReadCursor.findMany({
      where: {
        channelId: { in: channelIds },
        readerType: "ADMIN",
        readerId: ctx.userId,
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
            threadRootId: null, // Only count main messages
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        return { channelId: ch.id, count };
      })
    );

    const unreadMap = new Map(
      unreadCounts.map((u) => [u.channelId, u.count])
    );

    // For GROUP channels, fetch group info
    const groupIds = channels
      .filter((ch) => ch.channelType === "GROUP" && ch.groupId)
      .map((ch) => ch.groupId!);

    let groupMap = new Map<string, { id: string; color: string; slug: string }>();
    if (groupIds.length > 0) {
      const groups = await prisma.adminGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, color: true, slug: true },
      });
      groupMap = new Map(groups.map((g) => [g.id, g]));
    }

    const data = channels.map((ch) => ({
      id: ch.id,
      tenantId: ch.tenantId,
      channelType: ch.channelType,
      installationId: ch.installationId,
      groupId: ch.groupId,
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
        : null,
      group: ch.groupId && groupMap.has(ch.groupId)
        ? groupMap.get(ch.groupId)!
        : null,
      unreadCount: unreadMap.get(ch.id) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (err: any) {
    console.error("Error listing chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
