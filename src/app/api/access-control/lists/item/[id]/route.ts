import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.accessControlList.findUnique({
      where: { id },
      select: { installationId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entrada no encontrada" }, { status: 404 });
    }

    const authCtx = await requireAccessControlAuth(request, existing.installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();

    const entry = await prisma.accessControlList.update({
      where: { id },
      data: {
        fullName: body.fullName,
        company: body.company,
        blockReason: body.blockReason,
        scope: body.scope,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays,
        allowedTimeFrom: body.allowedTimeFrom,
        allowedTimeTo: body.allowedTimeTo,
        isActive: body.isActive,
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[AccessControl] Error updating list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar entrada" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.accessControlList.findUnique({
      where: { id },
      select: { installationId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entrada no encontrada" }, { status: 404 });
    }

    const authCtx = await requireAccessControlAuth(request, existing.installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await prisma.accessControlList.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error deleting list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar entrada" },
      { status: 500 }
    );
  }
}
