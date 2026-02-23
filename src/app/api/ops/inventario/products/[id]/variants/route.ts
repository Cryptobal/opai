import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const product = await prisma.inventoryProduct.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const variants = await prisma.inventoryProductVariant.findMany({
      where: { productId: id },
      include: { size: true },
    });

    return NextResponse.json(variants);
  } catch (e) {
    console.error("[inventario/products/[id]/variants GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar variantes" },
      { status: 500 }
    );
  }
}
