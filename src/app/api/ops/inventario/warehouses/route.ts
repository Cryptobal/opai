import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const createWarehouseSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["central", "supervisor", "installation", "other"]),
  supervisorId: z.string().optional().nullable(),
  installationId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId, active: true };
    if (type) where.type = type;

    const warehouses = await prisma.inventoryWarehouse.findMany({
      where,
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(warehouses);
  } catch (e) {
    console.error("[inventario/warehouses GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar bodegas" },
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
    const parsed = createWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const warehouse = await prisma.inventoryWarehouse.create({
      data: {
        tenantId: ctx.tenantId,
        name: parsed.data.name,
        type: parsed.data.type,
        supervisorId: parsed.data.supervisorId ?? null,
        installationId: parsed.data.installationId ?? null,
        notes: parsed.data.notes ?? null,
      },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(warehouse);
  } catch (e) {
    console.error("[inventario/warehouses POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear bodega" },
      { status: 500 }
    );
  }
}
