import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

/**
 * GET — Busca visitantes conocidos (AccessControlKnownVisitor) para
 * prellenar el picker masivo de listas blanca/negra.
 *
 * Query params:
 *   search  — texto libre (nombre, empresa o RUT parcial), opcional
 *   limit   — máximo de resultados, default 50
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

    const visitors = await safeAccessControlQuery(
      () =>
        prisma.accessControlKnownVisitor.findMany({
          where: search
            ? {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { company: { contains: search, mode: "insensitive" } },
                  { rut: { contains: search, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: { lastVisitAt: "desc" },
          take: limit,
          select: {
            rut: true,
            fullName: true,
            company: true,
            lastVisitAt: true,
            visitCount: true,
          },
        }),
      [],
    );

    return NextResponse.json({ success: true, data: visitors ?? [] });
  } catch (error) {
    console.error("[AccessControl] Error fetching known visitors:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar visitantes" },
      { status: 500 },
    );
  }
}
