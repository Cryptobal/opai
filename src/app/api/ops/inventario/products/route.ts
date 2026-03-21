import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";
import { parseSizesInput } from "@/lib/inventory-product-catalog";

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.enum(["uniform", "asset"]),
  notes: z.string().optional(),
  active: z.boolean().optional(),
  sizes: z.array(z.string()).optional(),
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

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.inventoryProduct.create({
        data: {
          tenantId: ctx.tenantId,
          name: parsed.data.name.trim(),
          sku: parsed.data.sku?.trim() || null,
          category: parsed.data.category,
          notes: parsed.data.notes?.trim() || null,
          active: parsed.data.active ?? true,
        },
      });

      const normalizedSizes = parseSizesInput((parsed.data.sizes ?? []).join(","));

      if (parsed.data.category === "asset") {
        await tx.inventoryProductVariant.create({
          data: {
            productId: product.id,
            sizeId: null,
            sku: parsed.data.sku ?? null,
          },
        });
      } else if (normalizedSizes.length > 0) {
        for (let i = 0; i < normalizedSizes.length; i += 1) {
          const sizeCode = normalizedSizes[i];
          const size = await tx.inventoryProductSize.create({
            data: {
              productId: product.id,
              sizeCode,
              sizeLabel: null,
              sortOrder: i + 1,
            },
          });
          await tx.inventoryProductVariant.create({
            data: {
              productId: product.id,
              sizeId: size.id,
              sku: parsed.data.sku ? `${parsed.data.sku}-${sizeCode}` : null,
            },
          });
        }
      }

      return tx.inventoryProduct.findUnique({
        where: { id: product.id },
        include: {
          sizes: { orderBy: { sortOrder: "asc" } },
          variants: { include: { size: true } },
        },
      });
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
