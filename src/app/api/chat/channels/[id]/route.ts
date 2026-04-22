/**
 * API Route: /api/chat/channels/[id]
 * GET — Get single channel details with installation and account info.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canDelete } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "hub")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden eliminar canales permanentemente" },
        { status: 403 }
      );
    }

    const { id: channelId } = await params;

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
    });
    if (!channel) {
      return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
    }

    await prisma.chatChannel.delete({ where: { id: channelId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting chat channel:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const channel = await prisma.chatChannel.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      include: {
        installation: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            commune: true,
            status: true,
            account: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    // GROUP channels require membership, except for client-facing system groups
    // which are visible to all admins of the tenant.
    if (channel.channelType === "GROUP" && channel.groupId && channel.subType !== "client_facing") {
      const membership = await prisma.adminGroupMembership.findFirst({
        where: { groupId: channel.groupId, adminId: ctx.userId },
      });
      const permsGet = await resolveApiPerms(ctx);
      if (!membership && !canEdit(permsGet, "hub")) {
        return NextResponse.json(
          { success: false, error: "No tienes acceso a este canal" },
          { status: 403 }
        );
      }
    }

    const data = {
      id: channel.id,
      tenantId: channel.tenantId,
      installationId: channel.installationId,
      name: channel.name,
      isActive: channel.isActive,
      lastMessageAt: channel.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: channel.lastMessagePreview,
      messageCount: channel.messageCount,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      installation: channel.installation
        ? {
            id: channel.installation.id,
            name: channel.installation.name,
            address: channel.installation.address,
            city: channel.installation.city,
            commune: channel.installation.commune,
            status: channel.installation.status,
            account: channel.installation.account
              ? {
                  id: channel.installation.account.id,
                  name: channel.installation.account.name,
                }
              : null,
          }
        : undefined,
    };

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error fetching chat channel:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
