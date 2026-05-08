import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioDelete } from "@/lib/inventory";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sizeId: string }> }
) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioDelete(ctx);
    if (forbidden) return forbidden;

    const { id, sizeId } = await params;

    const product = await prisma.inventoryProduct.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const size = await prisma.inventoryProductSize.findFirst({
      where: { id: sizeId, productId: id },
    });
    if (!size) {
      return NextResponse.json(
        { success: false, error: "Talla no encontrada" },
        { status: 404 }
      );
    }

    const variant = await prisma.inventoryProductVariant.findFirst({
      where: { productId: id, sizeId },
      include: {
        _count: {
          select: {
            purchaseLines: true,
            movementLines: true,
            stockRecords: true,
            guardiaAssignments: true,
            assets: true,
          },
        },
      },
    });

    if (variant) {
      const hasUsage =
        variant._count.purchaseLines > 0 ||
        variant._count.movementLines > 0 ||
        variant._count.stockRecords > 0 ||
        variant._count.guardiaAssignments > 0 ||
        variant._count.assets > 0;

      if (hasUsage) {
        return NextResponse.json(
          { success: false, error: "No se puede eliminar la talla: tiene uso en stock o movimientos" },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (variant) {
        await tx.inventoryProductVariant.delete({ where: { id: variant.id } });
      }
      await tx.inventoryProductSize.delete({ where: { id: sizeId } });
    });

    await createOpsAuditLog(
      ctx,
      "inventario.product.size.deleted",
      "inventario.product",
      id,
      { sizeId, sizeCode: size.sizeCode },
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/products/[id]/sizes/[sizeId] DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al eliminar talla" },
      { status: 500 }
    );
  }
}
