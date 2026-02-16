import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroupMembership, GroupMemberRole } from "@/lib/groups";

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

    const { id: groupId } = await params;

    const memberships = await prisma.adminGroupMembership.findMany({
      where: { groupId },
      include: {
        admin: { select: { id: true, name: true, email: true, role: true } },
        group: { select: { name: true, slug: true } },
      },
      orderBy: { joinedAt: "desc" },
    });

    const data: AdminGroupMembership[] = memberships.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      adminId: m.adminId,
      role: m.role as GroupMemberRole,
      joinedAt: m.joinedAt.toISOString(),
      adminName: m.admin.name,
      adminEmail: m.admin.email,
      adminRole: m.admin.role,
      groupName: m.group.name,
      groupSlug: m.group.slug,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error listing members:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los miembros" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: groupId } = await params;
    const body = await request.json();
    const { adminId, role } = body as { adminId?: string; role?: GroupMemberRole };

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: "adminId es requerido" },
        { status: 400 },
      );
    }

    const group = await prisma.adminGroup.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
    });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const admin = await prisma.admin.findFirst({
      where: { id: adminId, tenantId: ctx.tenantId },
    });
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    const membership = await prisma.adminGroupMembership.upsert({
      where: {
        groupId_adminId: { groupId, adminId },
      },
      update: { role: role ?? "member" },
      create: {
        groupId,
        adminId,
        role: role ?? "member",
      },
      include: {
        admin: { select: { id: true, name: true, email: true, role: true } },
        group: { select: { name: true, slug: true } },
      },
    });

    const data: AdminGroupMembership = {
      id: membership.id,
      groupId: membership.groupId,
      adminId: membership.adminId,
      role: membership.role as GroupMemberRole,
      joinedAt: membership.joinedAt.toISOString(),
      adminName: membership.admin.name,
      adminEmail: membership.admin.email,
      adminRole: membership.admin.role,
      groupName: membership.group.name,
      groupSlug: membership.group.slug,
    };

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[GROUPS] Error adding member:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo agregar el miembro al grupo" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: groupId } = await params;
    const body = await request.json();
    const { adminId } = body as { adminId?: string };

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: "adminId es requerido" },
        { status: 400 },
      );
    }

    await prisma.adminGroupMembership.deleteMany({
      where: { groupId, adminId },
    });

    return NextResponse.json({
      success: true,
      data: { groupId, adminId, removed: true },
    });
  } catch (error) {
    console.error("[GROUPS] Error removing member:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo remover el miembro del grupo" },
      { status: 500 },
    );
  }
}
