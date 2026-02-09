/**
 * API Route: /api/crm/pipeline/[id]
 * PATCH - Actualiza etapa
 * DELETE - Desactiva etapa
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;
    const body = await request.json();

    const stage = await prisma.crmPipelineStage.findFirst({
      where: { id, tenantId },
    });
    if (!stage) {
      return NextResponse.json({ success: false, error: "Etapa no encontrada" }, { status: 404 });
    }

    const updated = await prisma.crmPipelineStage.update({
      where: { id },
      data: {
        name: body?.name?.trim() ?? stage.name,
        order: Number.isFinite(body?.order) ? Number(body.order) : stage.order,
        color: body?.color ?? stage.color,
        isActive: body?.isActive ?? stage.isActive,
        isClosedWon: body?.isClosedWon ?? stage.isClosedWon,
        isClosedLost: body?.isClosedLost ?? stage.isClosedLost,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating CRM pipeline stage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update stage" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;

    const stage = await prisma.crmPipelineStage.findFirst({
      where: { id, tenantId },
    });
    if (!stage) {
      return NextResponse.json({ success: false, error: "Etapa no encontrada" }, { status: 404 });
    }

    await prisma.crmPipelineStage.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CRM pipeline stage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete stage" },
      { status: 500 }
    );
  }
}
