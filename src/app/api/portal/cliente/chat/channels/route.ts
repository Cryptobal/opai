/**
 * API Route: /api/portal/cliente/chat/channels
 * GET — List all channels for the client's account installations.
 *        Includes installation name, account name, and unread count.
 *        For prospect accounts: returns direct channel with ejecutivo + locked demo channels.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";
import { DEMO_CHAT_CHANNELS } from "@/lib/portal/demo-data";
import { batchUnreadCounts } from "@/lib/chat";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Check if account is a prospect
    const account = await prisma.crmAccount.findUnique({
      where: { id: session.accountId },
      select: { status: true, portalEjecutivoId: true },
    });

    if (account?.status === "prospect") {
      // For prospects: find the DIRECT channel with the ejecutivo
      let directChannelData: any[] = [];

      if (account.portalEjecutivoId) {
        const directChannel = await prisma.chatChannel.findFirst({
          where: {
            tenantId: session.tenantId,
            channelType: "DIRECT",
            dmParticipants: {
              some: { adminId: account.portalEjecutivoId },
            },
          },
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

        if (directChannel) {
          const unreadMap = await batchUnreadCounts([directChannel.id], "CLIENT", session.contactId);

          directChannelData = [
            {
              id: directChannel.id,
              tenantId: directChannel.tenantId,
              installationId: directChannel.installationId,
              name: directChannel.name,
              channelType: directChannel.channelType,
              isActive: directChannel.isActive,
              lastMessageAt: directChannel.lastMessageAt?.toISOString() ?? null,
              lastMessagePreview: directChannel.lastMessagePreview,
              messageCount: directChannel.messageCount,
              createdAt: directChannel.createdAt.toISOString(),
              updatedAt: directChannel.updatedAt.toISOString(),
              installation: directChannel.installation
                ? {
                    id: directChannel.installation.id,
                    name: directChannel.installation.name,
                    account: directChannel.installation.account
                      ? { id: directChannel.installation.account.id, name: directChannel.installation.account.name }
                      : null,
                  }
                : undefined,
              unreadCount: unreadMap.get(directChannel.id) ?? 0,
            },
          ];
        }
      }

      return NextResponse.json({
        success: true,
        data: directChannelData,
        lockedChannels: DEMO_CHAT_CHANNELS,
        meta: { total: directChannelData.length },
      });
    }

    // ── Active account: existing behavior ──

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

    // Batch unread counts in a single SQL query
    const channelIds = channels.map((ch) => ch.id);
    const unreadMap = await batchUnreadCounts(channelIds, "CLIENT", session.contactId);

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
