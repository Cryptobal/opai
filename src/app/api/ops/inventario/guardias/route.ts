import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
      },
      take: 500,
      select: {
        id: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(guardias);
  } catch (e) {
    console.error("[inventario/guardias GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar guardias" },
      { status: 500 }
    );
  }
}
