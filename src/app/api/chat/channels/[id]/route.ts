/**
 * API Route: /api/chat/channels/[id]
 * GET — Get single channel details with installation and account info.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (ctx.userRole !== "admin" && ctx.userRole !== "owner") {
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
            isActive: true,
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
