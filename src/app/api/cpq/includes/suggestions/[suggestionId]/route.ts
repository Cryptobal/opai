/**
 * API Route: /api/cpq/includes/suggestions/[suggestionId]
 * PUT    - Editar texto de una sugerencia
 * DELETE - Eliminar (soft-delete) una sugerencia
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { suggestionId } = await params;
    const body = await request.json();
    const text = body?.text?.trim();

    if (!text) {
      return NextResponse.json(
        { success: false, error: "El texto es requerido" },
        { status: 400 },
      );
    }

    const suggestion = await prisma.cpqIncludesSuggestion.findFirst({
      where: {
        id: suggestionId,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
    });

    if (!suggestion) {
      return NextResponse.json(
        { success: false, error: "Sugerencia no encontrada" },
        { status: 404 },
      );
    }

    const updated = await prisma.cpqIncludesSuggestion.update({
      where: { id: suggestionId },
      data: { text },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating suggestion:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar sugerencia" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { suggestionId } = await params;

    const suggestion = await prisma.cpqIncludesSuggestion.findFirst({
      where: {
        id: suggestionId,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
    });

    if (!suggestion) {
      return NextResponse.json(
        { success: false, error: "Sugerencia no encontrada" },
        { status: 404 },
      );
    }

    // Soft-delete: mark as inactive
    await prisma.cpqIncludesSuggestion.update({
      where: { id: suggestionId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting suggestion:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar sugerencia" },
      { status: 500 },
    );
  }
}
