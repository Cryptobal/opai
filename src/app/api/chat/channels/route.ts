/**
 * API Route: /api/chat/channels
 * GET — List channels for admin's tenant, sorted by lastMessageAt DESC.
 *        Supports ?type=GROUP|INSTALLATION|DIRECT|EXTERNAL (default: all).
 *        GROUP channels filtered by admin's group membership.
 *        DIRECT channels filtered by admin's DM participation.
 *        EXTERNAL channels filtered by admin's ChatChannelParticipant membership.
 *        Supports ?archived=true to show only archived channels (default: exclude archived).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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
      // Visible if admin is a member OR the group is a client-facing system group.
      where.OR = [
        { groupId: { in: memberGroupIds } },
        { subType: "client_facing" },
      ];
    } else if (typeFilter === "INSTALLATION") {
      where.channelType = "INSTALLATION";
      where.installation = { chatEnabled: true };
    } else if (typeFilter === "DIRECT") {
      // DM channels - only show channels where current admin is a participant
      where.channelType = "DIRECT";
      where.dmParticipants = { some: { adminId: ctx.userId } };
    } else if (typeFilter === "EXTERNAL") {
      // EXTERNAL channels - only show channels where current admin is a participant
      where.channelType = "EXTERNAL";
      where.participants = { some: { participantType: "ADMIN", participantId: ctx.userId } };
    } else {
      // Show installation channels + group channels the user belongs to + client-facing groups + DM channels + EXTERNAL channels
      where.OR = [
        { channelType: "INSTALLATION", installation: { chatEnabled: true } },
        { channelType: "GROUP", groupId: { in: memberGroupIds } },
        { channelType: "GROUP", subType: "client_facing" },
        { channelType: "DIRECT", dmParticipants: { some: { adminId: ctx.userId } } },
        { channelType: "EXTERNAL", participants: { some: { participantType: "ADMIN", participantId: ctx.userId } } },
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

    const allChannels = await prisma.chatChannel.findMany({
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

    // Fetch archived channel IDs for this admin
    const archivedSet = new Set(
      (
        await prisma.chatChannelArchive.findMany({
          where: {
            adminId: ctx.userId,
            channelId: { in: allChannels.map((c) => c.id) },
          },
          select: { channelId: true },
        })
      ).map((a) => a.channelId)
    );

    // Filter by archived param: ?archived=true shows only archived, default excludes archived
    const showArchived = sp.get("archived") === "true";
    const channels = showArchived
      ? allChannels.filter((c) => archivedSet.has(c.id))
      : allChannels.filter((c) => !archivedSet.has(c.id));

    // Batch unread counts in a single SQL query (exclude thread replies)
    const channelIds = channels.map((ch) => ch.id);
    const unreadMap = await batchUnreadCounts(channelIds, "ADMIN", ctx.userId, true);

    // Batch notification preferences
    const notifPrefs = channelIds.length > 0
      ? await prisma.chatNotificationPreference.findMany({
          where: { channelId: { in: channelIds }, userType: "ADMIN", userId: ctx.userId },
          select: { channelId: true, preference: true },
        })
      : [];
    const notifPrefMap = new Map(notifPrefs.map((p) => [p.channelId, p.preference]));

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

    // For DIRECT channels, fetch other participant's info
    const directChannelIds = channels
      .filter((ch) => ch.channelType === "DIRECT")
      .map((ch) => ch.id);

    let dmParticipantMap = new Map<string, { id: string; name: string; email: string; image: null }>();
    if (directChannelIds.length > 0) {
      const participants = await prisma.chatDmParticipant.findMany({
        where: {
          channelId: { in: directChannelIds },
          adminId: { not: ctx.userId }, // Get the OTHER participant
        },
        select: {
          channelId: true,
          adminId: true,
        },
      });

      const otherAdminIds = participants.map((p) => p.adminId);
      if (otherAdminIds.length > 0) {
        const admins = await prisma.admin.findMany({
          where: { id: { in: otherAdminIds } },
          select: { id: true, name: true, email: true },
        });
        const adminMap = new Map(admins.map((a) => [a.id, a]));
        for (const p of participants) {
          const admin = adminMap.get(p.adminId);
          if (admin) {
            dmParticipantMap.set(p.channelId, { ...admin, image: null });
          }
        }
      }
    }

    // For EXTERNAL channels, fetch account info
    const externalAccountIds = channels
      .filter((c) => c.channelType === "EXTERNAL" && c.accountId)
      .map((c) => c.accountId as string);

    const accountsMap =
      externalAccountIds.length > 0
        ? new Map(
          (
            await prisma.crmAccount.findMany({
              where: { id: { in: externalAccountIds } },
              select: { id: true, name: true, status: true },
            })
          ).map((a) => [a.id, a])
        )
        : new Map<string, { id: string; name: string; status: string }>();

    const data = channels.map((ch) => ({
      id: ch.id,
      tenantId: ch.tenantId,
      channelType: ch.channelType,
      installationId: ch.installationId,
      groupId: ch.groupId,
      name: ch.name,
      subType: ch.subType,
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
      dmParticipant: ch.channelType === "DIRECT" && dmParticipantMap.has(ch.id)
        ? dmParticipantMap.get(ch.id)!
        : null,
      unreadCount: unreadMap.get(ch.id) ?? 0,
      notificationPreference: notifPrefMap.get(ch.id) ?? "ALL",
      isArchivedByMe: archivedSet.has(ch.id),
      account: ch.channelType === "EXTERNAL" && ch.accountId
        ? (accountsMap.get(ch.accountId) ?? null)
        : null,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/chat/channels] Error:", message, err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
