import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from '@/lib/require-module';

/**
 * DELETE /api/ops/inventario/movements/[id]
 * Deshace una entrega a guardia (solo si aún no fue recepcionada en el portal).
 * Devuelve el stock a la bodega de origen y elimina asignaciones al guardia.
 */
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

    const movement = await prisma.inventoryMovement.findFirst({
      where: { id, tenantId: ctx.tenantId, type: "delivery" },
      include: {
        lines: true,
      },
    });

    if (!movement) {
      return NextResponse.json(
        { success: false, error: "Entrega no encontrada" },
        { status: 404 }
      );
    }

    if (movement.confirmationStatus === "confirmed") {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se puede deshacer una entrega ya recepcionada por el guardia. Si fue un error, contacta al administrador.",
        },
        { status: 400 }
      );
    }

    if (!movement.fromWarehouseId) {
      return NextResponse.json(
        { success: false, error: "La entrega no tiene bodega de origen" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const line of movement.lines) {
        const stock = await tx.inventoryStock.findFirst({
          where: {
            tenantId: ctx.tenantId,
            warehouseId: movement.fromWarehouseId!,
            variantId: line.variantId,
          },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: stock.quantity + line.quantity },
          });
        } else {
          await tx.inventoryStock.create({
            data: {
              tenantId: ctx.tenantId,
              warehouseId: movement.fromWarehouseId!,
              variantId: line.variantId,
              quantity: line.quantity,
              minStock: 0,
              avgCost: line.unitCost ?? null,
            },
          });
        }
      }

      await tx.inventoryMovement.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/movements DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al deshacer la entrega" },
      { status: 500 }
    );
  }
}
