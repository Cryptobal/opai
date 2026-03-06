import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.accessControlRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Registro no encontrado" },
        { status: 404 }
      );
    }

    if (existing.exitAt) {
      return NextResponse.json(
        { success: false, error: "La salida ya fue registrada" },
        { status: 400 }
      );
    }

    const record = await prisma.accessControlRecord.update({
      where: { id },
      data: {
        exitAt: new Date(),
        exitGuardId: body.exitGuardId || null,
        exitGpsLat: body.gpsLat ?? null,
        exitGpsLng: body.gpsLng ?? null,
        exitObservations: body.exitObservations || null,
      },
    });

    // Update preregistration status if linked
    if (existing.preregistrationId) {
      await prisma.accessControlPreregistration.update({
        where: { id: existing.preregistrationId },
        data: { status: "checked_out" },
      });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[AccessControl] Error recording exit:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar salida" },
      { status: 500 }
    );
  }
}
