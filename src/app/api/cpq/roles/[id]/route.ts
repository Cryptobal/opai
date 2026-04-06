/**
 * API Route: /api/cpq/roles/[id]
 * PUT    - Actualizar rol
 * DELETE - Desactivar rol
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from '@/lib/require-module';

type Params = { params: Promise<{ id: string }> };

function normalizeColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.cpqRol.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      active: body.active ?? true,
    };
    if (body.colorHex !== undefined) {
      data.colorHex = normalizeColorHex(body.colorHex);
    }
    if (body.patternWork !== undefined) {
      data.patternWork = typeof body.patternWork === "number" ? body.patternWork : null;
    }
    if (body.patternOff !== undefined) {
      data.patternOff = typeof body.patternOff === "number" ? body.patternOff : null;
    }

    const rol = await prisma.cpqRol.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: rol });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error updating rol:", error);
    const msg = typeof (error as Error)?.message === "string" && (error as Error).message.includes("color_hex")
      ? "Error al guardar el color. Ejecuta en el proyecto: npx prisma migrate deploy"
      : "Error al actualizar el rol";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.cpqRol.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    await prisma.cpqRol.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }
    console.error("Error deactivating rol:", error);
    return NextResponse.json(
      { success: false, error: "Failed to deactivate rol" },
      { status: 500 }
    );
  }
}
