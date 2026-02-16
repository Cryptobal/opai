import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, ensureOpsCapability } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/**
 * PATCH /api/personas/guardias/[id]/contract — Update contract fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (body.contractType !== undefined) updateData.contractType = body.contractType;
    if (body.contractStartDate !== undefined) {
      updateData.contractStartDate = body.contractStartDate ? new Date(body.contractStartDate) : null;
    }
    if (body.contractPeriod1End !== undefined) {
      updateData.contractPeriod1End = body.contractPeriod1End ? new Date(body.contractPeriod1End) : null;
    }
    if (body.contractPeriod2End !== undefined) {
      updateData.contractPeriod2End = body.contractPeriod2End ? new Date(body.contractPeriod2End) : null;
    }
    if (body.contractPeriod3End !== undefined) {
      updateData.contractPeriod3End = body.contractPeriod3End ? new Date(body.contractPeriod3End) : null;
    }
    if (body.contractCurrentPeriod !== undefined) {
      updateData.contractCurrentPeriod = body.contractCurrentPeriod;
    }
    if (body.contractBecameIndefinidoAt !== undefined) {
      updateData.contractBecameIndefinidoAt = body.contractBecameIndefinidoAt
        ? new Date(body.contractBecameIndefinidoAt)
        : null;
    }

    const updated = await prisma.opsGuardia.update({
      where: { id },
      data: updateData,
      select: {
        contractType: true,
        contractStartDate: true,
        contractPeriod1End: true,
        contractPeriod2End: true,
        contractPeriod3End: true,
        contractCurrentPeriod: true,
        contractBecameIndefinidoAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PERSONAS] Error updating contract:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el contrato" },
      { status: 500 }
    );
  }
}
