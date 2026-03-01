/**
 * PUT /api/config/ai-models/:id/set-default
 * Marks a model as the default for its provider (unmarks the previous one).
 */

import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const model = await prisma.aiModel.findUnique({
      where: { id },
      include: { provider: true },
    });

    if (!model || model.provider.tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { success: false, error: "Modelo no encontrado" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.aiModel.updateMany({
        where: { providerId: model.providerId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.aiModel.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ai-models] set-default error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al cambiar modelo por defecto" },
      { status: 500 }
    );
  }
}
