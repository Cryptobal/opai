import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { id: true, name: true, address: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        installationId: installation.id,
        installationName: installation.name,
        installationAddress: installation.address,
        isPreview: true,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error fetching preview:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener vista previa" },
      { status: 500 }
    );
  }
}
