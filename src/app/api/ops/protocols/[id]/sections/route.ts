/**
 * API Route: /api/ops/protocols/[id]/sections
 * POST - Bulk reorder sections (receives array of {id, order})
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: installationId } = await params;
    const body = await request.json();
    const { sections } = body as { sections: Array<{ id: string; order: number }> };

    if (!Array.isArray(sections)) {
      return NextResponse.json(
        { success: false, error: "sections array requerido" },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      sections.map((s) =>
        prisma.opsProtocolSection.updateMany({
          where: { id: s.id, tenantId: ctx.tenantId, installationId },
          data: { order: s.order },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error reordering sections:", error);
    return NextResponse.json(
      { success: false, error: "Error al reordenar secciones" },
      { status: 500 },
    );
  }
}
