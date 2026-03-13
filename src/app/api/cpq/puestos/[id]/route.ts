/**
 * API Route: /api/cpq/puestos/[id]
 * PUT    - Actualizar puesto de trabajo
 * DELETE - Desactivar puesto de trabajo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

function normalizeColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.cpqPuestoTrabajo.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const data: { name: string; active: boolean; colorHex?: string | null } = {
      name: body.name.trim(),
      active: body.active ?? true,
    };
    if (body.colorHex !== undefined) {
      data.colorHex = normalizeColorHex(body.colorHex);
    }

    const puesto = await prisma.cpqPuestoTrabajo.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: puesto });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un puesto con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error updating puesto:", error);
    const msg = typeof (error as Error)?.message === "string" && (error as Error).message.includes("color_hex")
      ? "Error al guardar el color. Ejecuta en el proyecto: npx prisma migrate deploy"
      : "Error al actualizar el puesto";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const existing = await prisma.cpqPuestoTrabajo.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    await prisma.cpqPuestoTrabajo.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }
    console.error("Error deactivating puesto:", error);
    return NextResponse.json(
      { success: false, error: "Failed to deactivate puesto" },
      { status: 500 }
    );
  }
}
