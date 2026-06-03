import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

/**
 * GET /api/finance/installations-geo?q=xxx
 * Instalaciones activas del tenant con coordenadas GPS, para usarlas como
 * origen/destino de una rendición por kilometraje. Filtro opcional por nombre.
 */

const LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const q = request.nextUrl.searchParams.get("q")?.trim();

    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "active",
        lat: { not: null },
        lng: { not: null },
        ...(q && q.length >= 1
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
                { commune: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        commune: true,
        lat: true,
        lng: true,
      },
      orderBy: { name: "asc" },
      take: LIMIT,
    });

    return NextResponse.json({ success: true, data: installations });
  } catch (error) {
    console.error("[Finance] Error listing installations geo:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar las instalaciones" },
      { status: 500 },
    );
  }
}
