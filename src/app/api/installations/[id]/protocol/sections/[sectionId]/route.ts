import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string; sectionId: string };

const updateSectionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  icon: z.string().max(10).optional(),
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

    const { id, sectionId } = await params;
    const { data, error } = await parseBody(request, updateSectionSchema);
    if (error) return error;

    const existing = await prisma.protocolSection.findFirst({
      where: { id: sectionId, installationId: id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    const section = await prisma.protocolSection.update({
      where: { id: sectionId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });

    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error("[PROTOCOL] Error updating section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la sección" },
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

    const { id, sectionId } = await params;

    const existing = await prisma.protocolSection.findFirst({
      where: { id: sectionId, installationId: id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    await prisma.protocolSection.delete({ where: { id: sectionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PROTOCOL] Error deleting section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la sección" },
      { status: 500 },
    );
  }
}
