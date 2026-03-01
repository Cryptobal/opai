import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string; itemId: string };

const updateItemSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar protocolos" },
        { status: 403 },
      );
    }

    const { id, itemId } = await params;
    const { data, error } = await parseBody(request, updateItemSchema);
    if (error) return error;

    const existing = await prisma.protocolItem.findFirst({
      where: {
        id: itemId,
        section: { installationId: id },
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 },
      );
    }

    const item = await prisma.protocolItem.update({
      where: { id: itemId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[PROTOCOL] Error updating item:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el ítem" },
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

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar protocolos" },
        { status: 403 },
      );
    }

    const { id, itemId } = await params;

    const existing = await prisma.protocolItem.findFirst({
      where: {
        id: itemId,
        section: { installationId: id },
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 },
      );
    }

    await prisma.protocolItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PROTOCOL] Error deleting item:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el ítem" },
      { status: 500 },
    );
  }
}
