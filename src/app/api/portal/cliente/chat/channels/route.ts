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

    // Para prospectos: nombre del ejecutivo para mostrar en el chat
    let ejecutivoName: string | null = null;
    if (account?.status === "prospect" && account.portalEjecutivoId) {
      const ejecutivo = await prisma.admin.findUnique({
        where: { id: account.portalEjecutivoId },
        select: { name: true },
      });
      ejecutivoName = ejecutivo?.name ?? null;
    }

    if (account?.status === "prospect") {
      // For prospects: find EXTERNAL channel where contact is participant (chat con ejecutivo)
      const externalChannel = await prisma.chatChannel.findFirst({
        where: {
          tenantId: session.tenantId,
          channelType: "EXTERNAL",
          accountId: session.accountId,
          isActive: true,
          participants: {
            some: { participantType: "CONTACT", participantId: session.contactId },
          },
        },
      });

      let channelData: any[] = [];
      if (externalChannel) {
        const unreadMap = await batchUnreadCounts([externalChannel.id], "CLIENT", session.contactId);
        const accountInfo = externalChannel.accountId
          ? await prisma.crmAccount.findUnique({
              where: { id: externalChannel.accountId },
              select: { id: true, name: true },
            })
          : null;
        const pref = await prisma.chatNotificationPreference.findFirst({
          where: { channelId: externalChannel.id, userType: "CLIENT", userId: session.contactId },
          select: { preference: true },
        });
        channelData = [
          {
            id: externalChannel.id,
            tenantId: externalChannel.tenantId,
            accountId: externalChannel.accountId,
            name: ejecutivoName ? `Chat con ${ejecutivoName}` : externalChannel.name,
            channelType: externalChannel.channelType,
            isActive: externalChannel.isActive,
            lastMessageAt: externalChannel.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: externalChannel.lastMessagePreview,
            messageCount: externalChannel.messageCount,
            createdAt: externalChannel.createdAt.toISOString(),
            updatedAt: externalChannel.updatedAt.toISOString(),
            account: accountInfo ? { id: accountInfo.id, name: accountInfo.name } : null,
            unreadCount: unreadMap.get(externalChannel.id) ?? 0,
            notificationPreference: pref?.preference ?? "ALL",
          },
        ];
      }

      return NextResponse.json({
        success: true,
        data: channelData,
        lockedChannels: DEMO_CHAT_CHANNELS,
        meta: { total: channelData.length },
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

    // Batch notification preferences
    const notifPrefs = channelIds.length > 0
      ? await prisma.chatNotificationPreference.findMany({
          where: { channelId: { in: channelIds }, userType: "CLIENT", userId: session.contactId },
          select: { channelId: true, preference: true },
        })
      : [];
    const notifPrefMap = new Map(notifPrefs.map((p) => [p.channelId, p.preference]));

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
      notificationPreference: notifPrefMap.get(ch.id) ?? "ALL",
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
