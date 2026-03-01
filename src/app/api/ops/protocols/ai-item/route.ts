/**
 * API Route: /api/ops/protocols/ai-item
 * POST - Generate a single protocol item with AI
 *
 * Body: { sectionId, description }
 * Returns the AI-generated item (title + description) without saving.
 * The frontend can then confirm and POST to create it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { generateProtocolItem } from "@/lib/protocol-ai";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para editar protocolos" }, { status: 403 });
    }

    const body = await request.json();
    const { sectionId, description } = body;

    if (!sectionId || !description) {
      return NextResponse.json(
        { success: false, error: "sectionId y description son requeridos" },
        { status: 400 },
      );
    }

    // Fetch section and existing items
    const section = await prisma.opsProtocolSection.findFirst({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { items: { select: { title: true, description: true } } },
    });
    if (!section) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    const existingItems = section.items.map((i) => ({
      title: i.title,
      description: i.description ?? "",
    }));

    const result = await generateProtocolItem(
      section.title,
      description,
      existingItems,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error AI generating item:", error);
    const msg = error instanceof Error ? error.message : "Error al generar ítem con IA";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
