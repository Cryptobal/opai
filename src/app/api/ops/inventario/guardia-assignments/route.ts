import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 400 }
      );
    }

    const assignments = await prisma.inventoryGuardiaAssignment.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardiaId,
        returnedAt: null,
      },
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true } },
            size: { select: { sizeCode: true } },
          },
        },
        movement: {
          select: {
            date: true,
            installation: { select: { id: true, name: true } },
            lines: { select: { variantId: true, unitCost: true } },
          },
        },
      },
      orderBy: { deliveredAt: "desc" },
    });

    const enriched = assignments.map((a) => {
      const line = a.movement.lines.find((l) => l.variantId === a.variantId);
      const unitCost = line ? Number(line.unitCost ?? 0) : 0;
      const totalCost = unitCost * a.quantity;
      const { lines: _lines, ...movement } = a.movement;
      return {
        ...a,
        unitCost,
        totalCost,
        movement,
      };
    });

    const totalAssignedCost = enriched.reduce((sum, a) => sum + a.totalCost, 0);

    return NextResponse.json({
      assignments: enriched,
      totalAssignedCost,
    });
  } catch (e) {
    console.error("[inventario/guardia-assignments GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar asignaciones" },
      { status: 500 }
    );
  }
}
