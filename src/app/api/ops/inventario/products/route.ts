import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.enum(["uniform", "asset"]),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const active = searchParams.get("active");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (category) where.category = category;
    if (active !== null && active !== undefined) {
      where.active = active === "true";
    }

    const products = await prisma.inventoryProduct.findMany({
      where,
      include: {
        sizes: { orderBy: { sortOrder: "asc" } },
        variants: { include: { size: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
  } catch (e) {
    console.error("[inventario/products GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar productos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const product = await prisma.inventoryProduct.create({
      data: {
        tenantId: ctx.tenantId,
        name: parsed.data.name,
        sku: parsed.data.sku ?? null,
        category: parsed.data.category,
        notes: parsed.data.notes ?? null,
      },
    });

    // Para activos sin tallas, crear una variante única
    if (parsed.data.category === "asset") {
      await prisma.inventoryProductVariant.create({
        data: {
          productId: product.id,
          sizeId: null,
          sku: parsed.data.sku ?? null,
        },
      });
    }

    const created = await prisma.inventoryProduct.findUnique({
      where: { id: product.id },
      include: { sizes: true, variants: { include: { size: true } } },
    });

    return NextResponse.json(created!);
  } catch (e) {
    console.error("[inventario/products POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear producto" },
      { status: 500 }
    );
  }
}
