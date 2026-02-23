import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  category: z.enum(["uniform", "asset"]).optional(),
  active: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

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
      include: {
        sizes: { orderBy: { sortOrder: "asc" } },
        variants: { include: { size: true } },
      },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(product);
  } catch (e) {
    console.error("[inventario/products/[id] GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al obtener producto" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const product = await prisma.inventoryProduct.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.sku !== undefined && { sku: parsed.data.sku }),
        ...(parsed.data.category && { category: parsed.data.category }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    });

    if (product.count === 0) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.inventoryProduct.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { sizes: true, variants: { include: { size: true } } },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[inventario/products/[id] PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
      include: { _count: { select: { variants: true } } },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    if (product._count.variants > 0) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar: tiene variantes o movimientos asociados" },
        { status: 400 }
      );
    }

    await prisma.inventoryProduct.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/products/[id] DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al eliminar producto" },
      { status: 500 }
    );
  }
}
