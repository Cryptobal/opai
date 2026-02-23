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
    const warehouseId = searchParams.get("warehouseId");
    const variantId = searchParams.get("variantId");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (warehouseId) where.warehouseId = warehouseId;
    if (variantId) where.variantId = variantId;

    const stock = await prisma.inventoryStock.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, type: true } },
        variant: {
          include: {
            product: { select: { id: true, name: true, category: true } },
            size: { select: { id: true, sizeCode: true, sizeLabel: true } },
          },
        },
      },
    });

    return NextResponse.json(stock);
  } catch (e) {
    console.error("[inventario/stock GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al consultar stock" },
      { status: 500 }
    );
  }
}
