/**
 * GET /api/ops/search
 * Búsqueda global en Ops: guardias por nombre, código o RUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const LIMIT = 10;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const contains = { contains: q, mode: "insensitive" as const };
    const searchNorm = q.replace(/[.\s-]/g, "");

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { persona: { firstName: contains } },
          { persona: { lastName: contains } },
          { persona: { rut: { contains: searchNorm, mode: "insensitive" } } },
          { code: contains },
        ],
      },
      take: LIMIT,
      select: {
        id: true,
        code: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
            rut: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = guardias.map((g) => ({
      id: g.id,
      type: "guardia" as const,
      title: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
      subtitle: g.code ? `Cód. ${g.code}` : g.persona.rut ?? undefined,
      href: `/personas/guardias/${g.id}`,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ops/search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 }
    );
  }
}
