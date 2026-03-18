/**
 * API: /api/crm/folders/[id]
 * PATCH - Renombrar carpeta o cambiar portalVisible
 * DELETE - Eliminar carpeta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const { name, portalVisible } = body;

    const existing = await prisma.documentFolder.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Carpeta no encontrada" },
        { status: 404 }
      );
    }

    const updateData: { name?: string; portalVisible?: boolean } = {};
    if (name !== undefined && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (typeof portalVisible === "boolean") {
      updateData.portalVisible = portalVisible;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    const result = await prisma.documentFolder.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: updateData,
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Carpeta no encontrada" },
        { status: 404 }
      );
    }
    const updated = await prisma.documentFolder.findFirst({
      where: { id, tenantId: ctx.tenantId },
    })!;

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[CRM] Error updating folder:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar carpeta" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.documentFolder.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Carpeta no encontrada" },
        { status: 404 }
      );
    }

    await prisma.documentFolder.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM] Error deleting folder:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar carpeta" },
      { status: 500 }
    );
  }
}
