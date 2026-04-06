/**
 * API Route: /api/cpq/includes/suggestions/[suggestionId]
 * PUT    - Editar texto de una sugerencia
 * DELETE - Eliminar (soft-delete) una sugerencia
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

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
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

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
