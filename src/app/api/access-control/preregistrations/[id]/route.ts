import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const prereg = await prisma.accessControlPreregistration.update({
      where: { id },
      data: {
        visitorName: body.visitorName,
        visitorCompany: body.visitorCompany,
        hostName: body.hostName,
        hostContact: body.hostContact,
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
        expectedTimeFrom: body.expectedTimeFrom,
        expectedTimeTo: body.expectedTimeTo,
        purpose: body.purpose,
        status: body.status,
      },
    });

    return NextResponse.json({ success: true, data: prereg });
  } catch (error) {
    console.error("[AccessControl] Error updating preregistration:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar pre-registro" },
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

    await prisma.accessControlPreregistration.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error deleting preregistration:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar pre-registro" },
      { status: 500 }
    );
  }
}
