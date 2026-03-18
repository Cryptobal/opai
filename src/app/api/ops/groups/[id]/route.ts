import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroup } from "@/lib/groups";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const group = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const data: AdminGroup = {
      id: group.id,
      tenantId: group.tenantId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      isSystem: group.isSystem,
      isActive: group.isActive,
      membersCount: group._count.memberships,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error fetching group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el grupo" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const updResult = await prisma.adminGroup.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        name: body.name ?? undefined,
        description: body.description !== undefined ? body.description : undefined,
        color: body.color ?? undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    });
    if (updResult.count === 0) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }
    const group = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const data: AdminGroup = {
      id: group.id,
      tenantId: group.tenantId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      isSystem: group.isSystem,
      isActive: group.isActive,
      membersCount: group._count.memberships,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };

    // Sync chat channel name and active status
    try {
      const chatChannel = await prisma.chatChannel.findFirst({
        where: { groupId: id, channelType: "GROUP", tenantId: ctx.tenantId },
      });
      if (chatChannel) {
        await prisma.chatChannel.updateMany({
          where: { id: chatChannel.id, tenantId: ctx.tenantId },
          data: {
            name: group.name,
            isActive: group.isActive,
          },
        });
      }
    } catch (chatErr) {
      console.error("[GROUPS] Error syncing chat channel:", chatErr);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error updating group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el grupo" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    if (existing.isSystem) {
      await prisma.adminGroup.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data: { isActive: false },
      });
    } else {
      await prisma.adminGroup.delete({ where: { id } });
    }

    // Deactivate associated chat channel
    try {
      await prisma.chatChannel.updateMany({
        where: { groupId: id, channelType: "GROUP", tenantId: ctx.tenantId },
        data: { isActive: false },
      });
    } catch (chatErr) {
      console.error("[GROUPS] Error deactivating chat channel:", chatErr);
    }

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error("[GROUPS] Error deleting group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el grupo" },
      { status: 500 },
    );
  }
}
