import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
