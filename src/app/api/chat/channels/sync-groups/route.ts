/**
 * API Route: /api/chat/channels/sync-groups
 * POST — Sync AdminGroups → ChatChannels.
 *        Creates missing group channels, updates names, deactivates removed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

export async function POST() {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Get all active admin groups for the tenant
    const groups = await prisma.adminGroup.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true },
    });

    // Get all existing group channels for the tenant
    const existingChannels = await prisma.chatChannel.findMany({
      where: { tenantId: ctx.tenantId, channelType: "GROUP" },
      select: { id: true, groupId: true, name: true, isActive: true },
    });

    const channelByGroupId = new Map(
      existingChannels.map((ch) => [ch.groupId, ch])
    );
    const groupIds = new Set(groups.map((g) => g.id));

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    // Create or update channels for each group
    for (const group of groups) {
      const existing = channelByGroupId.get(group.id);
      if (!existing) {
        await prisma.chatChannel.create({
          data: {
            tenantId: ctx.tenantId,
            channelType: "GROUP",
            groupId: group.id,
            name: group.name,
          },
        });
        created++;
      } else if (existing.name !== group.name || !existing.isActive) {
        await prisma.chatChannel.update({
          where: { id: existing.id },
          data: { name: group.name, isActive: true },
        });
        updated++;
      }
    }

    // Deactivate channels for removed/inactive groups
    for (const ch of existingChannels) {
      if (ch.groupId && !groupIds.has(ch.groupId) && ch.isActive) {
        await prisma.chatChannel.update({
          where: { id: ch.id },
          data: { isActive: false },
        });
        deactivated++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, updated, deactivated },
    });
  } catch (err: any) {
    console.error("Error syncing group channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
