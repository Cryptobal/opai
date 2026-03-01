import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string; sectionId: string };

const createItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  source: z.string().max(50).optional(),
  order: z.number().int().min(0).optional(),
});

export async function POST(
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
    const { data, error } = await parseBody(request, createItemSchema);
    if (error) return error;

    const section = await prisma.protocolSection.findFirst({
      where: { id: sectionId, installationId: id },
      select: { id: true },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    let order = data.order;
    if (order === undefined) {
      const last = await prisma.protocolItem.findFirst({
        where: { sectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      order = (last?.order ?? -1) + 1;
    }

    const item = await prisma.protocolItem.create({
      data: {
        sectionId,
        title: data.title,
        description: data.description,
        source: data.source ?? "manual",
        order,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("[PROTOCOL] Error creating item:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el ítem" },
      { status: 500 },
    );
  }
}
