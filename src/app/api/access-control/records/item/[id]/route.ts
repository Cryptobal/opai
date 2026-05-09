import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const record = await prisma.accessControlRecord.findUnique({
      where: { id },
      include: {
        installation: { select: { id: true, name: true, accountId: true } },
      },
    });
    if (!record) {
      return NextResponse.json(
        { success: false, error: "Registro no encontrado" },
        { status: 404 }
      );
    }

    const authCtx = await requireAccessControlAuth(request, record.installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    let preregistration = null;
    if (record.preregistrationId) {
      preregistration = await prisma.accessControlPreregistration.findUnique({
        where: { id: record.preregistrationId },
        select: {
          id: true,
          visitorName: true,
          hostName: true,
          purpose: true,
          expectedDate: true,
          expectedEndDate: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { ...record, preregistration },
    });
  } catch (error) {
    console.error("[AccessControl] Error fetching record detail:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener registro" },
      { status: 500 }
    );
  }
}
