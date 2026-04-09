/**
 * API Route: /api/portal/guardia/chat/channels
 * GET — List channels for the guard's current installation(s).
 *        Includes installation name, account name, and unread count.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGuardSession } from "@/lib/portal-chat-auth";
import { batchUnreadCounts } from "@/lib/chat";

export async function GET(request: NextRequest) {
  try {
    const session = getGuardSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Find the guard's current installation and active assignments
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: session.guardiaId },
      select: {
        currentInstallationId: true,
        asignaciones: {
          where: { isActive: true },
          select: { installationId: true },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Collect all installation IDs the guard has access to
    const installationIds = new Set<string>();
    if (guardia.currentInstallationId) {
      installationIds.add(guardia.currentInstallationId);
    }
    for (const a of guardia.asignaciones) {
      installationIds.add(a.installationId);
    }

    if (installationIds.size === 0) {
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
        installationId: { in: Array.from(installationIds) },
        NOT: { subType: "interno" },
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
    const unreadMap = await batchUnreadCounts(channelIds, "GUARD", session.guardiaId);

    // Batch notification preferences
    const notifPrefs = channelIds.length > 0
      ? await prisma.chatNotificationPreference.findMany({
          where: { channelId: { in: channelIds }, userType: "GUARD", userId: session.guardiaId },
          select: { channelId: true, preference: true },
        })
      : [];
    const notifPrefMap = new Map(notifPrefs.map((p) => [p.channelId, p.preference]));

    const data = channels.map((ch) => ({
      id: ch.id,
      tenantId: ch.tenantId,
      installationId: ch.installationId,
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
    console.error("[Portal Guardia] Error listing chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
