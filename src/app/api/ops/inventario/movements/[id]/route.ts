import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioDeleteOwn } from "@/lib/inventory";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

/**
 * DELETE /api/ops/inventario/movements/[id]
 *
 * Revertir un movimiento. Soporta:
 *   - delivery: devuelve stock a la bodega de origen y elimina la asignación al guardia.
 *   - transfer: revierte el movimiento entre bodegas.
 *
 * Permisos:
 *   - owner/admin/editor (canDelete) pueden revertir cualquier movimiento.
 *   - supervisor (canEdit) solo puede revertir movimientos creados por él mismo.
 *   - Si la entrega ya fue confirmada por el guardia (FES), bloquea la reversión.
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

    const { id } = await params;

    const movement = await prisma.inventoryMovement.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: true },
    });

    if (!movement) {
      return NextResponse.json(
        { success: false, error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    const forbidden = await ensureInventarioDeleteOwn(ctx, movement.createdBy);
    if (forbidden) return forbidden;

    if (movement.type === "delivery" && movement.confirmationStatus === "confirmed") {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se puede deshacer una entrega ya recepcionada por el guardia. Si fue un error, contacta al administrador.",
        },
        { status: 400 }
      );
    }

    if (movement.type === "delivery") {
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

      await createOpsAuditLog(
        ctx,
        "inventario.movement.delivery.reverted",
        "inventario.movement",
        id,
        {
          guardiaId: movement.guardiaId,
          installationId: movement.installationId,
          fromWarehouseId: movement.fromWarehouseId,
          ownReversion: movement.createdBy === ctx.userId,
        },
      );

      return NextResponse.json({ success: true });
    }

    if (movement.type === "transfer") {
      if (!movement.fromWarehouseId || !movement.toWarehouseId) {
        return NextResponse.json(
          { success: false, error: "La transferencia no tiene bodegas válidas" },
          { status: 400 }
        );
      }

      // Revertir: devolver stock al origen y descontar del destino.
      await prisma.$transaction(async (tx) => {
        for (const line of movement.lines) {
          // Descuento en destino
          const stockDestino = await tx.inventoryStock.findFirst({
            where: {
              tenantId: ctx.tenantId,
              warehouseId: movement.toWarehouseId!,
              variantId: line.variantId,
            },
          });
          if (!stockDestino || stockDestino.quantity < line.quantity) {
            throw new Error(
              "No se puede revertir: el stock destino ya fue usado posteriormente.",
            );
          }
          await tx.inventoryStock.update({
            where: { id: stockDestino.id },
            data: { quantity: stockDestino.quantity - line.quantity },
          });

          // Reposición en origen
          const stockOrigen = await tx.inventoryStock.findFirst({
            where: {
              tenantId: ctx.tenantId,
              warehouseId: movement.fromWarehouseId!,
              variantId: line.variantId,
            },
          });
          if (stockOrigen) {
            await tx.inventoryStock.update({
              where: { id: stockOrigen.id },
              data: { quantity: stockOrigen.quantity + line.quantity },
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

      await createOpsAuditLog(
        ctx,
        "inventario.movement.transfer.reverted",
        "inventario.movement",
        id,
        {
          fromWarehouseId: movement.fromWarehouseId,
          toWarehouseId: movement.toWarehouseId,
          ownReversion: movement.createdBy === ctx.userId,
        },
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: `Reversión no soportada para tipo "${movement.type}"` },
      { status: 400 }
    );
  } catch (e) {
    console.error("[inventario/movements DELETE]", e);
    const msg = e instanceof Error ? e.message : "Error al deshacer el movimiento";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
