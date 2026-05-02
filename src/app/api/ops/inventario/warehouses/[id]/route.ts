import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  ensureInventarioAccess,
  ensureInventarioEdit,
  ensureInventarioDelete,
} from "@/lib/inventory";
import { createOpsAuditLog } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';
import { z } from "zod";

const updateWarehouseSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["central", "supervisor", "installation", "other"]).optional(),
  supervisorId: z.string().optional().nullable(),
  installationId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

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

    const warehouse = await prisma.inventoryWarehouse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "Bodega no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(warehouse);
  } catch (e) {
    console.error("[inventario/warehouses/[id] GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al obtener bodega" },
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
    const parsed = updateWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const previous = await prisma.inventoryWarehouse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { name: true, type: true, active: true, supervisorId: true, installationId: true },
    });

    const count = await prisma.inventoryWarehouse.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.type && { type: parsed.data.type }),
        ...(parsed.data.supervisorId !== undefined && { supervisorId: parsed.data.supervisorId }),
        ...(parsed.data.installationId !== undefined && { installationId: parsed.data.installationId }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    });

    if (count.count === 0) {
      return NextResponse.json(
        { success: false, error: "Bodega no encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.inventoryWarehouse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    await createOpsAuditLog(
      ctx,
      "inventario.warehouse.updated",
      "inventario.warehouse",
      id,
      { previous: previous ?? null, changes: parsed.data },
    );

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[inventario/warehouses/[id] PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar bodega" },
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
    const forbidden = await ensureInventarioDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const warehouse = await prisma.inventoryWarehouse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        _count: {
          select: {
            stockRecords: true,
            movementsFrom: true,
            movementsTo: true,
            purchaseLines: true,
          },
        },
      },
    });

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "Bodega no encontrada" },
        { status: 404 }
      );
    }

    const hasStockWithQty = await prisma.inventoryStock.count({
      where: { warehouseId: id, tenantId: ctx.tenantId, quantity: { gt: 0 } },
    });

    if (hasStockWithQty > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se puede eliminar: la bodega aún tiene stock con cantidades > 0. Mueve el stock primero o desactiva la bodega.",
        },
        { status: 400 }
      );
    }

    if (warehouse._count.movementsFrom > 0 || warehouse._count.movementsTo > 0 || warehouse._count.purchaseLines > 0) {
      // Hay historial: en vez de borrar duro, sugerimos desactivar.
      return NextResponse.json(
        {
          success: false,
          error: "Esta bodega tiene movimientos o compras asociados. Por trazabilidad solo puede desactivarse.",
        },
        { status: 400 }
      );
    }

    // Borrado seguro (sin historial ni stock).
    await prisma.inventoryStock.deleteMany({
      where: { warehouseId: id, tenantId: ctx.tenantId },
    });
    await prisma.inventoryWarehouse.delete({ where: { id } });

    await createOpsAuditLog(
      ctx,
      "inventario.warehouse.deleted",
      "inventario.warehouse",
      id,
      { name: warehouse.name, type: warehouse.type },
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/warehouses/[id] DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al eliminar bodega" },
      { status: 500 }
    );
  }
}
