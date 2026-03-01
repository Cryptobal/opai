/**
 * API Route: /api/ops/protocols/[id]/sections/[sectionId]/items/[itemId]
 * PATCH  - Update item
 * DELETE - Delete item
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string; sectionId: string; itemId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para editar protocolos" }, { status: 403 });
    }

    const { itemId } = await params;

    const existing = await prisma.opsProtocolItem.findFirst({
      where: { id: itemId, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.order !== undefined) data.order = body.order;

    const item = await prisma.opsProtocolItem.update({
      where: { id: itemId },
      data,
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error updating item:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar ítem" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para eliminar protocolos" }, { status: 403 });
    }

    const { itemId } = await params;

    const existing = await prisma.opsProtocolItem.findFirst({
      where: { id: itemId, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 },
      );
    }

    await prisma.opsProtocolItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error deleting item:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar ítem" },
      { status: 500 },
    );
  }
}
