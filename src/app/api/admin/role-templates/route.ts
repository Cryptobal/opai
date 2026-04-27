/**
 * API: Role Templates (CRUD)
 * GET  /api/admin/role-templates           — Lista todos los templates del tenant (admin)
 * GET  /api/admin/role-templates?compact=1 — Lista compacta (cualquier autenticado, para RoleSwitcher)
 * POST /api/admin/role-templates           — Crea un nuevo template
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  type RolePermissions,
  validatePermissions,
  getDefaultPermissions,
  mergeRolePermissions,
} from "@/lib/permissions";

export async function GET(request: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(request.url);
  const compact = searchParams.get("compact") === "1";

  if (!compact) {
    // Modo completo: solo owner/admin
    if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden gestionar roles" },
        { status: 403 },
      );
    }
  } else {
    // Modo compact: cualquier autenticado del tenant.
    // Restringimos los permisos del payload solo a owner/admin (para simulación);
    // el resto recibe metadata sin el cuerpo completo de permisos.
  }

  if (compact) {
    const templates = await prisma.roleTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isSystem: true,
        permissions: true,
        updatedAt: true,
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    const allowSimulation = ctx.userRole === "owner" || ctx.userRole === "admin";
    return NextResponse.json({
      success: true,
      data: templates.map((t) => {
        const merged =
          t.isSystem && (t.slug === "owner" || t.slug === "admin")
            ? mergeRolePermissions(
                getDefaultPermissions(t.slug),
                ((t.permissions as unknown as RolePermissions) ?? {
                  modules: {},
                  submodules: {},
                  capabilities: {},
                }) as RolePermissions,
              )
            : (t.permissions as unknown as RolePermissions);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          isSystem: t.isSystem,
          updatedAt: t.updatedAt,
          permissions: allowSimulation ? merged : null,
        };
      }),
    });
  }

  const templates = await prisma.roleTemplate.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      _count: { select: { admins: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    success: true,
    data: templates.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      isSystem: t.isSystem,
      permissions:
        t.isSystem && (t.slug === "owner" || t.slug === "admin")
          ? mergeRolePermissions(
              getDefaultPermissions(t.slug),
              ((t.permissions as unknown as RolePermissions) ?? {
                modules: {},
                submodules: {},
                capabilities: {},
              }) as RolePermissions,
            )
          : t.permissions,
      usersCount: t._count.admins,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json(
      { success: false, error: "Solo administradores pueden crear roles" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 },
    );
  }

  const { name, slug, description, permissions } = body as {
    name?: string;
    slug?: string;
    description?: string;
    permissions?: unknown;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "name es requerido" },
      { status: 400 },
    );
  }

  // Auto-generate slug from name if not provided
  const finalSlug =
    slug && typeof slug === "string"
      ? slug.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
      : name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  // Check slug uniqueness
  const existing = await prisma.roleTemplate.findFirst({
    where: { tenantId: ctx.tenantId, slug: finalSlug },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Ya existe un rol con slug "${finalSlug}"` },
      { status: 409 },
    );
  }

  // Validate permissions
  const validation = validatePermissions(permissions);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: `Permisos inválidos: ${validation.errors.join(", ")}` },
      { status: 400 },
    );
  }

  const template = await prisma.roleTemplate.create({
    data: {
      tenantId: ctx.tenantId,
      name: name.trim(),
      slug: finalSlug,
      description: description ? String(description).trim() : null,
      isSystem: false,
      permissions: validation.permissions as object,
    },
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
