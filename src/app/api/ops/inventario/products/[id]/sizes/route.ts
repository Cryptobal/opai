import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const createSizeSchema = z.object({
  sizeCode: z.string().min(1),
  sizeLabel: z.string().optional(),
  sortOrder: z.number().optional(),
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
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const sizes = await prisma.inventoryProductSize.findMany({
      where: { productId: id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(sizes);
  } catch (e) {
    console.error("[inventario/products/[id]/sizes GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar tallas" },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const parsed = createSizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const product = await prisma.inventoryProduct.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const existing = await prisma.inventoryProductSize.findFirst({
      where: { productId: id, sizeCode: parsed.data.sizeCode },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe una talla con ese código" },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.inventoryProductSize.aggregate({
      where: { productId: id },
      _max: { sortOrder: true },
    });
    const sortOrder = parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1;

    const size = await prisma.$transaction(async (tx) => {
      const s = await tx.inventoryProductSize.create({
        data: {
          productId: id,
          sizeCode: parsed.data.sizeCode,
          sizeLabel: parsed.data.sizeLabel ?? null,
          sortOrder,
        },
      });
      await tx.inventoryProductVariant.create({
        data: {
          productId: id,
          sizeId: s.id,
          sku: product.sku ? `${product.sku}-${parsed.data.sizeCode}` : null,
        },
      });
      return s;
    });

    const sizeWithVariant = await prisma.inventoryProductSize.findUnique({
      where: { id: size.id },
      include: { variants: true },
    });

    return NextResponse.json(sizeWithVariant ?? size);
  } catch (e) {
    console.error("[inventario/products/[id]/sizes POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear talla" },
      { status: 500 }
    );
  }
}
