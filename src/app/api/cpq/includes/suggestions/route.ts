/**
 * API Route: /api/cpq/includes/suggestions
 * GET - Lista sugerencias activas de ítems "Incluye"
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const serviceType = searchParams.get("serviceType");

    const where: Record<string, unknown> = {
      isActive: true,
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    };
    if (serviceType) {
      where.OR = [
        { tenantId: ctx.tenantId, serviceType },
        { tenantId: ctx.tenantId, serviceType: null },
        { tenantId: null, serviceType },
        { tenantId: null, serviceType: null },
      ];
    }

    const suggestions = await prisma.cpqIncludesSuggestion.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error("Error fetching includes suggestions:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener sugerencias" },
      { status: 500 }
    );
  }
}
