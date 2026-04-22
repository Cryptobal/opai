/**
 * API Route: /api/portal/cliente/chat/groups
 * GET — Return (or create) the 4 predefined group channels for the tenant.
 *       Group channels are shared across all clients within the same tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { batchUnreadCounts } from "@/lib/chat";

const PREDEFINED_GROUPS = [
  { groupId: "admin_finanzas", name: "Administración y Finanzas" },
  { groupId: "rrhh", name: "Recursos Humanos" },
  { groupId: "comercial", name: "Equipo Comercial" },
  { groupId: "operaciones", name: "Operaciones" },
];

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Ensure all predefined group channels exist for this tenant.
    // Marked with subType="client_facing" so the ERP surfaces them to all
    // admins of the tenant without requiring AdminGroupMembership.
    const channels = await Promise.all(
      PREDEFINED_GROUPS.map(async (group) => {
        const existing = await prisma.chatChannel.findFirst({
          where: {
            tenantId: session.tenantId,
            groupId: group.groupId,
            channelType: "GROUP",
          },
        });

        if (existing) {
          if (existing.subType !== "client_facing" || !existing.isActive) {
            return prisma.chatChannel.update({
              where: { id: existing.id },
              data: { subType: "client_facing", isActive: true },
            });
          }
          return existing;
        }

        return prisma.chatChannel.create({
          data: {
            tenantId: session.tenantId,
            channelType: "GROUP",
            groupId: group.groupId,
            subType: "client_facing",
            name: group.name,
            isActive: true,
          },
        });
      })
    );

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
      name: ch.name,
      groupId: ch.groupId,
      channelType: ch.channelType,
      installationId: null,
      lastMessageAt: ch.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: ch.lastMessagePreview,
      unreadCount: unreadMap.get(ch.id) ?? 0,
      notificationPreference: notifPrefMap.get(ch.id) ?? "ALL",
    }));

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[Portal Cliente] Error listing group channels:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
