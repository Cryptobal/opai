import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess, ensureInventarioEdit } from "@/lib/inventory";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const { variantId, minStock } = body as { variantId?: string; minStock?: number };

    if (!variantId || minStock == null || minStock < 0) {
      return NextResponse.json(
        { success: false, error: "variantId y minStock (>=0) son requeridos" },
        { status: 400 },
      );
    }

    // Verify variant belongs to this product and tenant
    const variant = await prisma.inventoryProductVariant.findFirst({
      where: { id: variantId, productId: id, product: { tenantId: ctx.tenantId } },
    });
    if (!variant) {
      return NextResponse.json(
        { success: false, error: "Variante no encontrada" },
        { status: 404 },
      );
    }

    const updated = await prisma.inventoryProductVariant.update({
      where: { id: variantId },
      data: { minStock },
    });

    await createOpsAuditLog(
      ctx,
      "inventario.product.variant.updated",
      "inventario.product",
      id,
      { variantId, minStock },
    );

    return NextResponse.json({ success: true, minStock: updated.minStock });
  } catch (e) {
    console.error("[inventario/products/[id]/variants PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar stock mínimo" },
      { status: 500 },
    );
  }
}
