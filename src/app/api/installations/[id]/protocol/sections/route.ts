import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const createSectionSchema = z.object({
  title: z.string().min(1).max(200),
  icon: z.string().max(10).optional(),
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

    const { id } = await params;
    const { data, error } = await parseBody(request, createSectionSchema);
    if (error) return error;

    let order = data.order;
    if (order === undefined) {
      const last = await prisma.protocolSection.findFirst({
        where: { installationId: id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      order = (last?.order ?? -1) + 1;
    }

    const section = await prisma.protocolSection.create({
      data: {
        installationId: id,
        title: data.title,
        icon: data.icon ?? "📋",
        order,
      },
    });

    return NextResponse.json({ success: true, data: section }, { status: 201 });
  } catch (error) {
    console.error("[PROTOCOL] Error creating section:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la sección" },
      { status: 500 },
    );
  }
}
