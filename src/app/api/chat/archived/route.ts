import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(_req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  // Get all channel IDs archived by this user
  const archives = await prisma.chatChannelArchive.findMany({
    where: { adminId: ctx.userId },
    select: { channelId: true },
  });

  const channelIds = archives.map((a) => a.channelId);

  if (channelIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Fetch the actual channels (must belong to tenant)
  const channels = await prisma.chatChannel.findMany({
    where: {
      id: { in: channelIds },
      tenantId: ctx.tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      channelType: true,
      accountId: true,
      lastMessageAt: true,
      lastMessagePreview: true,
    },
  });

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
      : new Map();

  const data = channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    channelType: ch.channelType,
    accountId: ch.accountId ?? null,
    lastMessageAt: ch.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: ch.lastMessagePreview ?? null,
    isArchivedByMe: true,
    account: ch.accountId ? (accountsMap.get(ch.accountId) ?? null) : null,
    unreadCount: 0, // archived channels don't show unread badge
    groupId: null,
    installationId: null,
    group: null,
    installation: null,
    dmParticipant: null,
  }));

  return NextResponse.json({ success: true, data });
}
