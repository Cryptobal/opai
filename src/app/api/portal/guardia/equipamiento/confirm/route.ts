import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/portal/guardia/equipamiento/confirm
 *
 * Confirms a delivery receipt using Face ID (primary) or marcación PIN (fallback).
 * Records: timestamp, IP, device, method, confidence for FES legal traceability.
 *
 * Body:
 *   - movementId: string (required)
 *   - guardiaId: string (required)
 *   - method: "face_id" | "pin" (required)
 *   - faceConfidence?: number (required if method=face_id, from face-verify endpoint)
 *   - pin?: string (required if method=pin, the guard's marcación PIN)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movementId, guardiaId, method, faceConfidence, pin } = body as {
      movementId?: string;
      guardiaId?: string;
      method?: "face_id" | "pin";
      faceConfidence?: number;
      pin?: string;
    };

    if (!movementId || !guardiaId || !method) {
      return NextResponse.json(
        { success: false, error: "movementId, guardiaId y method son requeridos" },
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

    // Validate based on method
    if (method === "face_id") {
      if (!faceConfidence || faceConfidence < 95) {
        return NextResponse.json(
          { success: false, error: "La verificación facial no alcanzó el umbral requerido (95%)" },
          { status: 400 },
        );
      }
    } else if (method === "pin") {
      if (!pin) {
        return NextResponse.json(
          { success: false, error: "PIN de marcación requerido" },
          { status: 400 },
        );
      }

      // Validate against guard's existing marcación PIN
      const guardia = await prisma.opsGuardia.findUnique({
        where: { id: guardiaId },
        select: { marcacionPin: true, marcacionPinVisible: true },
      });

      if (!guardia) {
        return NextResponse.json(
          { success: false, error: "Guardia no encontrado" },
          { status: 404 },
        );
      }

      // Same PIN validation logic as portal auth
      let pinValid = false;
      if (guardia.marcacionPin) {
        if (guardia.marcacionPin.startsWith("$2")) {
          pinValid = await bcrypt.compare(pin, guardia.marcacionPin);
        } else {
          pinValid = pin === guardia.marcacionPin;
        }
      }
      if (!pinValid && guardia.marcacionPinVisible) {
        pinValid = pin === guardia.marcacionPinVisible;
      }

      if (!pinValid) {
        return NextResponse.json(
          { success: false, error: "PIN incorrecto. Usa el mismo PIN de marcación de asistencia." },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Método debe ser 'face_id' o 'pin'" },
        { status: 400 },
      );
    }

    // Build FES integrity hash
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const now = new Date();

    const hashInput = [
      guardiaId,
      movementId,
      method,
      now.toISOString(),
      ip,
      movement.tenantId,
    ].join("|");
    const integrityHash = crypto.createHash("sha256").update(hashInput).digest("hex");

    // Confirm the delivery
    await prisma.inventoryMovement.update({
      where: { id: movementId },
      data: {
        confirmationStatus: "confirmed",
        confirmedAt: now,
        confirmedMethod: method,
        confirmedIp: ip,
        confirmedDevice: userAgent,
        confirmedFaceConf: method === "face_id" ? faceConfidence : null,
        confirmedHash: integrityHash,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Entrega confirmada exitosamente",
      confirmedAt: now.toISOString(),
      method,
    });
  } catch (e) {
    console.error("[portal/guardia/equipamiento/confirm POST]", e);
    return NextResponse.json(
      { success: false, error: "Error al confirmar entrega" },
      { status: 500 },
    );
  }
}
