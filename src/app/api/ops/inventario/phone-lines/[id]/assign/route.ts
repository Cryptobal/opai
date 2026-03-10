import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { z } from "zod";

const assignSchema = z.object({
  installationId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

export async function POST(
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
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify phone line exists and belongs to tenant
    const phoneLine = await prisma.inventoryPhoneLine.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!phoneLine) {
      return NextResponse.json(
        { success: false, error: "Línea no encontrada" },
        { status: 404 }
      );
    }

    // Close any active assignment (allows "moving" in one step)
    await prisma.inventoryPhoneLineAssignment.updateMany({
      where: { phoneLineId: id, tenantId: ctx.tenantId, returnedAt: null },
      data: { returnedAt: new Date() },
    });

    // Create new assignment
    const assignment = await prisma.inventoryPhoneLineAssignment.create({
      data: {
        tenantId: ctx.tenantId,
        phoneLineId: id,
        installationId: parsed.data.installationId,
        assignedAt: new Date(),
        assignedBy: ctx.userId,
        notes: parsed.data.notes ?? null,
      },
      include: {
        installation: { select: { id: true, name: true } },
        phoneLine: { select: { id: true, phoneNumber: true, carrier: true } },
      },
    });

    return NextResponse.json(assignment);
  } catch (e) {
    console.error("[inventario/phone-lines/[id]/assign POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al asignar línea telefónica" },
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

    // Verify phone line exists
    const phoneLine = await prisma.inventoryPhoneLine.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!phoneLine) {
      return NextResponse.json(
        { success: false, error: "Línea no encontrada" },
        { status: 404 }
      );
    }

    // Find active assignment
    const active = await prisma.inventoryPhoneLineAssignment.findFirst({
      where: { phoneLineId: id, tenantId: ctx.tenantId, returnedAt: null },
    });

    if (!active) {
      return NextResponse.json(
        { success: false, error: "La línea no está asignada a ninguna instalación" },
        { status: 400 }
      );
    }

    await prisma.inventoryPhoneLineAssignment.update({
      where: { id: active.id },
      data: { returnedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[inventario/phone-lines/[id]/assign DELETE]", e);
    return NextResponse.json(
      { success: false, error: "Error al desvincular línea telefónica" },
      { status: 500 }
    );
  }
}
