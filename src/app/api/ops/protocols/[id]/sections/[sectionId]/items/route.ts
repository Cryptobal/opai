/**
 * API Route: /api/ops/protocols/[id]/sections/[sectionId]/items
 * GET  - List items in a section
 * POST - Create item in section
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

type Params = { id: string; sectionId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver protocolos" }, { status: 403 });
    }

    const { sectionId } = await params;

    const items = await prisma.opsProtocolItem.findMany({
      where: { sectionId, tenantId: ctx.tenantId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error fetching items:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener ítems" },
      { status: 500 },
    );
  }
}

export async function POST(
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

    const { sectionId } = await params;
    const body = await request.json();
    const { title, description, order, source } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "title requerido" },
        { status: 400 },
      );
    }

    // Verify section belongs to this tenant
    const section = await prisma.opsProtocolSection.findFirst({
      where: { id: sectionId, tenantId: ctx.tenantId },
    });
    if (!section) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    const item = await prisma.opsProtocolItem.create({
      data: {
        tenantId: ctx.tenantId,
        sectionId,
        title,
        description: description ?? null,
        order: order ?? 0,
        source: source ?? "manual",
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error creating item:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear ítem" },
      { status: 500 },
    );
  }
}
