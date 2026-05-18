import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTableMissingError } from "@/lib/access-control/safe-query";
import type { Prisma } from "@prisma/client";

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

    // exitCustomFields: persistir solo si llega no-vacío. Si llega `null` o
    // `{}` no sobreescribimos (defensive, evita borrar info en re-tries
    // o en clientes viejos que no envían la prop).
    const exitCustomFields =
      body.exitCustomFields && typeof body.exitCustomFields === "object"
        ? (body.exitCustomFields as Prisma.InputJsonValue)
        : undefined;

    const record = await prisma.accessControlRecord.update({
      where: { id },
      data: {
        exitAt: new Date(),
        exitGuardId: body.exitGuardId || null,
        exitGpsLat: body.gpsLat ?? null,
        exitGpsLng: body.gpsLng ?? null,
        exitObservations: body.exitObservations || null,
        ...(exitCustomFields !== undefined ? { exitCustomFields } : {}),
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
    if (isTableMissingError(error)) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen. Ejecute la migración." },
        { status: 503 }
      );
    }
    console.error("[AccessControl] Error recording exit:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar salida" },
      { status: 500 }
    );
  }
}
