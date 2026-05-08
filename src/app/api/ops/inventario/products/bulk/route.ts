import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioEdit } from "@/lib/inventory";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';
import { parseSizesInput } from "@/lib/inventory-product-catalog";

const bulkSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        category: z.enum(["uniform", "asset"]).default("uniform"),
        sku: z.string().optional(),
        notes: z.string().optional(),
        active: z.boolean().optional(),
        sizes: z.array(z.string()).optional(),
      })
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const summary = await prisma.$transaction(async (tx) => {
      let createdProducts = 0;
      let updatedProducts = 0;
      let createdSizes = 0;

      for (const item of parsed.data.items) {
        const name = item.name.trim();
        if (!name) continue;

        const existing = await tx.inventoryProduct.findFirst({
          where: {
            tenantId: ctx.tenantId,
            name: { equals: name, mode: "insensitive" },
          },
          include: {
            sizes: { orderBy: { sortOrder: "asc" } },
            variants: true,
          },
        });

        const product = existing
          ? await tx.inventoryProduct.update({
              where: { id: existing.id },
              data: {
                name,
                category: item.category,
                sku: item.sku?.trim() || existing.sku,
                notes: item.notes?.trim() || existing.notes,
                active: item.active ?? existing.active,
              },
              include: {
                sizes: { orderBy: { sortOrder: "asc" } },
                variants: true,
              },
            })
          : await tx.inventoryProduct.create({
              data: {
                tenantId: ctx.tenantId,
                name,
                category: item.category,
                sku: item.sku?.trim() || null,
                notes: item.notes?.trim() || null,
                active: item.active ?? true,
              },
              include: {
                sizes: { orderBy: { sortOrder: "asc" } },
                variants: true,
              },
            });

        if (existing) updatedProducts += 1;
        else createdProducts += 1;

        if (product.category === "asset") {
          const hasAssetVariant = product.variants.some((v) => v.sizeId === null);
          if (!hasAssetVariant) {
            await tx.inventoryProductVariant.create({
              data: {
                productId: product.id,
                sizeId: null,
                sku: product.sku ?? null,
              },
            });
          }
          continue;
        }

        const existingSizes = new Set(product.sizes.map((s) => s.sizeCode.toUpperCase()));
        const incomingSizes = parseSizesInput((item.sizes ?? []).join(","));
        if (incomingSizes.length === 0) continue;

        let nextOrder = product.sizes.reduce((max, s) => Math.max(max, s.sortOrder), 0);
        for (const sizeCode of incomingSizes) {
          if (existingSizes.has(sizeCode)) continue;
          nextOrder += 1;
          const size = await tx.inventoryProductSize.create({
            data: {
              productId: product.id,
              sizeCode,
              sizeLabel: null,
              sortOrder: nextOrder,
            },
          });
          await tx.inventoryProductVariant.create({
            data: {
              productId: product.id,
              sizeId: size.id,
              sku: product.sku ? `${product.sku}-${sizeCode}` : null,
            },
          });
          createdSizes += 1;
        }
      }

      return { createdProducts, updatedProducts, createdSizes };
    });

    await createOpsAuditLog(
      ctx,
      "inventario.product.bulk_imported",
      "inventario.product",
      undefined,
      summary,
    );

    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[inventario/products/bulk POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear productos en lote" },
      { status: 500 }
    );
  }
}
