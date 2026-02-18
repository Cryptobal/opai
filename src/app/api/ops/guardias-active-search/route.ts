/**
 * GET /api/ops/guardias-active-search?q=xxx
 * Búsqueda de guardias activos (contratado_activo, seleccionado) por nombre, código o RUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    let guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        lifecycleStatus: { in: ["contratado_activo", "seleccionado", "te"] },
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { persona: { firstName: { contains: q, mode: "insensitive" } } },
          { persona: { lastName: { contains: q, mode: "insensitive" } } },
          { persona: { rut: { contains: q, mode: "insensitive" } } },
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

    if (guardias.length === 0) {
      const allActive = await prisma.opsGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          lifecycleStatus: { in: ["contratado_activo", "seleccionado", "te"] },
        },
        take: 100,
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
      const qLower = q.toLowerCase();
      const searchable = (g: (typeof allActive)[0]) =>
        `${g.persona?.firstName ?? ""} ${g.persona?.lastName ?? ""} ${g.code ?? ""} ${g.persona?.rut ?? ""}`.toLowerCase();
      guardias = allActive.filter((g) => searchable(g).includes(qLower)).slice(0, LIMIT);
    }

    const data = guardias.map((g) => ({
      id: g.id,
      nombreCompleto: `${g.persona?.firstName ?? ""} ${g.persona?.lastName ?? ""}`.trim() || "Sin nombre",
      code: g.code ?? undefined,
      rut: g.persona?.rut ?? undefined,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ops/guardias-active-search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 }
    );
  }
}
