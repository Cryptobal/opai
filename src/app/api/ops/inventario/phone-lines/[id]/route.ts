import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const updatePhoneLineSchema = z.object({
  phoneNumber: z.string().min(1).optional(),
  carrier: z.string().min(1).optional(),
  planType: z.string().optional().nullable(),
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  label: z.string().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function normalizePhoneNumber(raw: string): string {
  let n = raw.replace(/[\s\-().]/g, "");
  if (n.startsWith("56") && !n.startsWith("+")) n = "+" + n;
  if (/^9\d{8}$/.test(n)) n = "+56" + n;
  return n;
}

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

    const phoneLine = await prisma.inventoryPhoneLine.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        asset: { select: { id: true, serialNumber: true } },
        assignments: {
          include: {
            installation: { select: { id: true, name: true } },
          },
          orderBy: { assignedAt: "desc" },
        },
      },
    });

    if (!phoneLine) {
      return NextResponse.json(
        { success: false, error: "Línea no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(phoneLine);
  } catch (e) {
    console.error("[inventario/phone-lines/[id] GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al obtener línea telefónica" },
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
    const parsed = updatePhoneLineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Build update data
    const data: Record<string, unknown> = {};
    if (parsed.data.carrier !== undefined) data.carrier = parsed.data.carrier.toLowerCase().trim();
    if (parsed.data.planType !== undefined) data.planType = parsed.data.planType;
    if (parsed.data.label !== undefined) data.label = parsed.data.label;
    if (parsed.data.assetId !== undefined) data.assetId = parsed.data.assetId;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    // Handle phoneNumber change with uniqueness check
    if (parsed.data.phoneNumber !== undefined) {
      const phoneNumber = normalizePhoneNumber(parsed.data.phoneNumber);
      const existing = await prisma.inventoryPhoneLine.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phoneNumber,
          id: { not: id },
        },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Ya existe otra línea con este número" },
          { status: 400 }
        );
      }
      data.phoneNumber = phoneNumber;
    }

    // Handle status change to "cancelled" — close active assignment
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
      if (parsed.data.status === "cancelled") {
        await prisma.inventoryPhoneLineAssignment.updateMany({
          where: { phoneLineId: id, tenantId: ctx.tenantId, returnedAt: null },
          data: { returnedAt: new Date() },
        });
      }
    }

    const count = await prisma.inventoryPhoneLine.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data,
    });

    if (count.count === 0) {
      return NextResponse.json(
        { success: false, error: "Línea no encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.inventoryPhoneLine.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        asset: { select: { id: true, serialNumber: true } },
        assignments: {
          where: { returnedAt: null },
          include: {
            installation: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[inventario/phone-lines/[id] PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar línea telefónica" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const phoneLine = await prisma.inventoryPhoneLine.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        assignments: { where: { returnedAt: null } },
      },
    });

    if (!phoneLine) {
      return NextResponse.json(
        { success: false, error: "Línea no encontrada" },
        { status: 404 }
      );
    }

    if (phoneLine.assignments.length > 0) {
      return NextResponse.json(
        { success: false, error: "Debe desvincular la línea de la instalación antes de eliminarla" },
        { status: 400 }
      );
    }

    await prisma.inventoryPhoneLine.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/phone-lines/[id] DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al eliminar línea telefónica" },
      { status: 500 }
    );
  }
}
