import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
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

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[inventario/warehouses/[id] PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar bodega" },
      { status: 500 }
    );
  }
}
