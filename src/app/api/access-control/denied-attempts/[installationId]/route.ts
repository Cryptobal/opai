import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanRut, validateRut } from "@/lib/access-control/utils";
import { isTableMissingError } from "@/lib/access-control/safe-query";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const body = await request.json();
    const { rut, fullName, guardId, blockReason, gpsLat, gpsLng, blacklistEntryId } = body as {
      rut?: string;
      fullName?: string;
      guardId?: string;
      blockReason?: string;
      gpsLat?: number;
      gpsLng?: number;
      blacklistEntryId?: string;
    };

    if (!rut || !validateRut(rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }
    if (!guardId) {
      return NextResponse.json(
        { success: false, error: "guardId requerido" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const attempt = await prisma.accessControlDeniedAttempt.create({
      data: {
        tenantId: installation.tenantId,
        installationId,
        guardId,
        rut: cleanRut(rut),
        fullName: fullName || null,
        blacklistEntryId: blacklistEntryId || null,
        blockReason: blockReason || null,
        gpsLat: gpsLat ?? null,
        gpsLng: gpsLng ?? null,
      },
    });

    return NextResponse.json({ success: true, data: attempt }, { status: 201 });
  } catch (err) {
    if (isTableMissingError(err)) {
      return NextResponse.json(
        { success: false, error: "Tablas no migradas" },
        { status: 503 }
      );
    }
    console.error("[AccessControl] Error creating denied attempt:", err);
    return NextResponse.json(
      { success: false, error: "Error al registrar intento" },
      { status: 500 }
    );
  }
}
