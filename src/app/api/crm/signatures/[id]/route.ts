/**
 * API Route: /api/crm/signatures/[id]
 * GET    - Obtener firma por ID
 * PATCH  - Actualizar firma
 * DELETE - Desactivar firma (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const signature = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!signature) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: signature });
  } catch (error) {
    console.error("Error fetching signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch signature" },
      { status: 500 }
    );
  }
}

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
    const { name, content, htmlContent, isDefault } = body;

    const existing = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 }
      );
    }

    // Si se marca como default, desmarcar las demás del mismo usuario
    if (isDefault && !existing.isDefault) {
      await prisma.crmEmailSignature.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId: existing.userId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.crmEmailSignature.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(htmlContent !== undefined ? { htmlContent } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update signature" },
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

    const existing = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 }
      );
    }

    await prisma.crmEmailSignature.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete signature" },
      { status: 500 }
    );
  }
}
