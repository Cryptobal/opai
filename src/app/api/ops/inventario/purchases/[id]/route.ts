import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from '@/lib/require-module';
import { z } from "zod";

const updatePurchaseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitCost: z.number().nonnegative(),
      warehouseId: z.string().uuid(),
    })
  ).min(1),
});

export async function PUT(
  request: NextRequest,
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
    const body = await request.json();
    const parsed = updatePurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const purchase = await prisma.$transaction(async (tx) => {
      // Verify ownership
      const existing = await tx.inventoryPurchase.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { lines: true },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      // Reverse old stock
      for (const line of existing.lines) {
        const stock = await tx.inventoryStock.findFirst({
          where: {
            warehouseId: line.warehouseId,
            variantId: line.variantId,
            tenantId: ctx.tenantId,
          },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: Math.max(0, stock.quantity - line.quantity) },
          });
        }
      }

      // Delete old lines (cascade would handle on purchase delete, but we're updating)
      await tx.inventoryPurchaseLine.deleteMany({
        where: { purchaseId: id },
      });

      // Update purchase header
      await tx.inventoryPurchase.update({
        where: { id },
        data: {
          date: new Date(parsed.data.date),
          notes: parsed.data.notes ?? null,
        },
      });

      // Create new lines and add stock
      for (const line of parsed.data.lines) {
        await tx.inventoryPurchaseLine.create({
          data: {
            purchaseId: id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            warehouseId: line.warehouseId,
          },
        });

        const stock = await tx.inventoryStock.findFirst({
          where: {
            warehouseId: line.warehouseId,
            variantId: line.variantId,
            tenantId: ctx.tenantId,
          },
        });

        if (stock) {
          const newQty = stock.quantity + line.quantity;
          const oldAvg = Number(stock.avgCost ?? 0);
          const newAvg =
            oldAvg === 0
              ? line.unitCost
              : (oldAvg * stock.quantity + line.unitCost * line.quantity) / newQty;
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: newQty, avgCost: newAvg },
          });
        } else {
          await tx.inventoryStock.create({
            data: {
              tenantId: ctx.tenantId,
              warehouseId: line.warehouseId,
              variantId: line.variantId,
              quantity: line.quantity,
              avgCost: line.unitCost,
            },
          });
        }
      }

      return tx.inventoryPurchase.findUnique({
        where: { id },
        include: {
          lines: {
            include: {
              variant: { include: { product: true, size: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    return NextResponse.json(purchase);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Compra no encontrada" },
        { status: 404 }
      );
    }
    console.error("[inventario/purchases PUT]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar compra" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryPurchase.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { lines: true },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      // Reverse stock for each line
      for (const line of existing.lines) {
        const stock = await tx.inventoryStock.findFirst({
          where: {
            warehouseId: line.warehouseId,
            variantId: line.variantId,
            tenantId: ctx.tenantId,
          },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: Math.max(0, stock.quantity - line.quantity) },
          });
        }
      }

      // Delete purchase (cascade deletes lines)
      await tx.inventoryPurchase.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Compra no encontrada" },
        { status: 404 }
      );
    }
    console.error("[inventario/purchases DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al eliminar compra" },
      { status: 500 }
    );
  }
}
