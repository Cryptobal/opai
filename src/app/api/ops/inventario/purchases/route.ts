import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const createPurchaseSchema = z.object({
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

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(from);
      if (to) (where.date as Record<string, unknown>).lte = new Date(to);
    }

    const purchases = await prisma.inventoryPurchase.findMany({
      where,
      include: {
        lines: {
          include: {
            variant: { include: { product: true, size: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 100,
    });

    return NextResponse.json(purchases);
  } catch (e) {
    console.error("[inventario/purchases GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar compras" },
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
    const parsed = createPurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.inventoryPurchase.create({
        data: {
          tenantId: ctx.tenantId,
          date: new Date(parsed.data.date),
          notes: parsed.data.notes ?? null,
          createdBy: ctx.userId,
        },
      });

      for (const line of parsed.data.lines) {
        await tx.inventoryPurchaseLine.create({
          data: {
            purchaseId: p.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            warehouseId: line.warehouseId,
          },
        });

        const existing = await tx.inventoryStock.findFirst({
          where: {
            warehouseId: line.warehouseId,
            variantId: line.variantId,
            tenantId: ctx.tenantId,
          },
        });

        if (existing) {
          const newQty = existing.quantity + line.quantity;
          const oldAvg = Number(existing.avgCost ?? 0);
          const newAvg =
            oldAvg === 0
              ? line.unitCost
              : (oldAvg * existing.quantity + line.unitCost * line.quantity) / newQty;
          await tx.inventoryStock.update({
            where: { id: existing.id },
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
        where: { id: p.id },
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
  } catch (e) {
    console.error("[inventario/purchases POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al registrar compra" },
      { status: 500 }
    );
  }
}
