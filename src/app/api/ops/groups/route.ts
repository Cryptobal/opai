import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroup } from "@/lib/groups";
import { slugify } from "@/lib/groups";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const groups = await prisma.adminGroup.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });

    const data: AdminGroup[] = groups.map((g) => ({
      id: g.id,
      tenantId: g.tenantId,
      slug: g.slug,
      name: g.name,
      description: g.description,
      color: g.color,
      isSystem: g.isSystem,
      isActive: g.isActive,
      membersCount: g._count.memberships,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error listing groups:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los grupos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { name, description, color, slug: rawSlug } = body as {
      name?: string;
      description?: string;
      color?: string;
      slug?: string;
    };

    if (!name) {
      return NextResponse.json(
        { success: false, error: "name es requerido" },
        { status: 400 },
      );
    }

    const slug = rawSlug ?? slugify(name);

    const existing = await prisma.adminGroup.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Ya existe un grupo con slug "${slug}"` },
        { status: 409 },
      );
    }

    const group = await prisma.adminGroup.create({
      data: {
        tenantId: ctx.tenantId,
        slug,
        name,
        description: description ?? null,
        color: color ?? "#6B7280",
        isSystem: false,
        isActive: true,
      },
      include: { _count: { select: { memberships: true } } },
    });

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

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[GROUPS] Error creating group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el grupo" },
      { status: 500 },
    );
  }
}
