import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * POST /api/portal/guardia/equipamiento/confirm
 *
 * Confirms a delivery receipt using a 6-digit PIN (FES - Firma Electrónica Simple).
 * Records: timestamp, IP, device info for legal traceability.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movementId, guardiaId, pin } = body as {
      movementId?: string;
      guardiaId?: string;
      pin?: string;
    };

    if (!movementId || !guardiaId || !pin) {
      return NextResponse.json(
        { success: false, error: "movementId, guardiaId y pin son requeridos" },
        { status: 400 },
      );
    }

    // Find the movement
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        id: movementId,
        guardiaId,
        type: "delivery",
      },
    });

    if (!movement) {
      return NextResponse.json(
        { success: false, error: "Entrega no encontrada" },
        { status: 404 },
      );
    }

    if (movement.confirmationStatus === "confirmed") {
      return NextResponse.json(
        { success: false, error: "Esta entrega ya fue confirmada" },
        { status: 400 },
      );
    }

    if (!movement.confirmationPin) {
      return NextResponse.json(
        { success: false, error: "No hay PIN de confirmación para esta entrega" },
        { status: 400 },
      );
    }

    // Check PIN expiration
    if (movement.confirmationPinExp && new Date() > movement.confirmationPinExp) {
      await prisma.inventoryMovement.update({
        where: { id: movementId },
        data: { confirmationStatus: "expired" },
      });
      return NextResponse.json(
        { success: false, error: "El PIN ha expirado. Solicita uno nuevo." },
        { status: 400 },
      );
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, movement.confirmationPin);
    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "PIN incorrecto" },
        { status: 400 },
      );
    }

    // Confirm the delivery — record FES evidence
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await prisma.inventoryMovement.update({
      where: { id: movementId },
      data: {
        confirmationStatus: "confirmed",
        confirmedAt: new Date(),
        confirmedIp: ip,
        confirmedDevice: userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Entrega confirmada exitosamente",
      confirmedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[portal/guardia/equipamiento/confirm POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al confirmar entrega" },
      { status: 500 },
    );
  }
}
