/**
 * API: Role Template Individual
 * GET    /api/admin/role-templates/[id] — Detalle del template
 * PUT    /api/admin/role-templates/[id] — Actualizar template
 * DELETE /api/admin/role-templates/[id] — Eliminar template
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { validatePermissions } from "@/lib/permissions";
import { invalidateTemplateCache } from "@/lib/permissions-server";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteContext) {
  const authCtx = await requireAuth();
  if (!authCtx) return unauthorized();

  if (authCtx.userRole !== "owner" && authCtx.userRole !== "admin") {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  const template = await prisma.roleTemplate.findFirst({
    where: { id, tenantId: authCtx.tenantId },
    include: {
      admins: {
        select: { id: true, name: true, email: true, status: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: template });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const authCtx = await requireAuth();
  if (!authCtx) return unauthorized();

  if (authCtx.userRole !== "owner" && authCtx.userRole !== "admin") {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  const template = await prisma.roleTemplate.findFirst({
    where: { id, tenantId: authCtx.tenantId },
  });

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template no encontrado" },
      { status: 404 },
    );
  }

  // Proteger template "owner" de sistema
  if (template.isSystem && template.slug === "owner") {
    return NextResponse.json(
      { success: false, error: "No se puede modificar el rol de propietario" },
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

  const { name, description, permissions } = body as {
    name?: string;
    description?: string;
    permissions?: unknown;
  };

  const updateData: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "name debe ser un string no vacío" },
        { status: 400 },
      );
    }
    updateData.name = name.trim();
  }

  if (description !== undefined) {
    updateData.description = description ? String(description).trim() : null;
  }

  if (permissions !== undefined) {
    // No permitir modificar permisos de templates "admin" sistema
    // (admin siempre full, solo owner puede editar admin template)
    if (template.isSystem && template.slug === "admin" && authCtx.userRole !== "owner") {
      return NextResponse.json(
        { success: false, error: "Solo el propietario puede modificar el rol de administrador" },
        { status: 403 },
      );
    }

    const validation = validatePermissions(permissions);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: `Permisos inválidos: ${validation.errors.join(", ")}` },
        { status: 400 },
      );
    }
    updateData.permissions = validation.permissions as object;
  }

  const updated = await prisma.roleTemplate.update({
    where: { id },
    data: updateData,
  });

  await logAudit({
    userId: authCtx.userId,
    userEmail: authCtx.userEmail,
    action: "PERMISSION_CHANGE",
    entity: "RoleTemplate",
    entityId: id,
    details: {
      type: "UPDATE",
      before: { name: template.name, description: template.description, permissions: template.permissions },
      after: { name: updated.name, description: updated.description, permissions: updated.permissions },
    },
    tenantId: authCtx.tenantId,
    request,
  });

  // Invalidar cache para que los cambios sean efectivos
  invalidateTemplateCache(id);

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const authCtx = await requireAuth();
  if (!authCtx) return unauthorized();

  if (authCtx.userRole !== "owner" && authCtx.userRole !== "admin") {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  const template = await prisma.roleTemplate.findFirst({
    where: { id, tenantId: authCtx.tenantId },
    include: { _count: { select: { admins: true } } },
  });

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template no encontrado" },
      { status: 404 },
    );
  }

  if (template.isSystem) {
    return NextResponse.json(
      { success: false, error: "No se puede eliminar un rol de sistema" },
      { status: 403 },
    );
  }

  if (template._count.admins > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `No se puede eliminar: hay ${template._count.admins} usuario(s) usando este rol. Reasígnelos primero.`,
      },
      { status: 409 },
    );
  }

  await prisma.roleTemplate.delete({ where: { id } });
  invalidateTemplateCache(id);

  await logAudit({
    userId: authCtx.userId,
    userEmail: authCtx.userEmail,
    action: "PERMISSION_CHANGE",
    entity: "RoleTemplate",
    entityId: id,
    details: { type: "DELETE", before: { name: template.name, slug: template.slug }, after: null },
    tenantId: authCtx.tenantId,
    request: _request,
  });

  return NextResponse.json({ success: true });
}
