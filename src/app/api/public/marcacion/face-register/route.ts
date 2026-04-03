/**
 * POST /api/public/marcacion/face-register
 * Registers a guard's face in AWS Rekognition for Face ID marcacion.
 * Public route (no session auth) — authenticated via RUT + PIN.
 *
 * Flow:
 * 1. Validate RUT + PIN
 * 2. Detect face in image (Rekognition DetectFaces)
 * 3. Index face in collection (Rekognition IndexFaces)
 * 4. Upload reference photo to R2
 * 5. Update OpsGuardia with faceId fields
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import { registerFace } from "@/lib/services/rekognition";
import { uploadFile } from "@/lib/storage";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
  image: z.string().min(1),
  installationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rut, pin, image, installationId } = parsed.data;

    // Validate RUT
    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json(
        { success: false, error: "RUT invalido" },
        { status: 400 }
      );
    }

    // Find installation
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, status: "active" },
      select: { id: true, tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalacion no encontrada" },
        { status: 404 }
      );
    }

    // Find guard
    const persona = await prisma.opsPersona.findFirst({
      where: {
        rut: normalizedRut,
        tenantId: installation.tenantId,
      },
      select: {
        id: true,
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            marcacionPin: true,
            faceIdRegistered: true,
            faceIdAwsId: true,
          },
        },
      },
    });

    if (!persona || !persona.guardia) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    const guardia = persona.guardia;

    // Verify status
    if (!["seleccionado", "contratado"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json(
        { success: false, error: "Guardia no activo" },
        { status: 403 }
      );
    }

    if (guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 }
      );
    }

    if (!guardia.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado" },
        { status: 403 }
      );
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, guardia.marcacionPin);
    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    // Check if already registered
    if (guardia.faceIdRegistered && guardia.faceIdAwsId) {
      return NextResponse.json(
        { success: false, error: "Face ID ya esta registrado. Para re-registrar, contacta al administrador." },
        { status: 409 }
      );
    }

    // Decode image
    const imageBuffer = Buffer.from(image, "base64");

    // Register face in Rekognition
    let registration;
    try {
      registration = await registerFace(guardia.id, imageBuffer);
    } catch (err) {
      console.error("[face-register] Rekognition error:", err);
      return NextResponse.json(
        { success: false, error: "Error en el servicio de reconocimiento facial. Intenta de nuevo." },
        { status: 500 }
      );
    }

    if (!registration.success || !registration.faceId) {
      return NextResponse.json(
        { success: false, error: registration.error || "No se pudo registrar el rostro" },
        { status: 400 }
      );
    }

    // Upload reference photo to R2
    let photoUrl: string | null = null;
    let photoKey: string | null = null;
    try {
      const uploadResult = await uploadFile(
        imageBuffer,
        "face-reference.jpg",
        "image/jpeg",
        `guardias/${guardia.id}`,
        installation.tenantId
      );
      photoUrl = uploadResult.publicUrl;
      photoKey = uploadResult.storageKey;
    } catch (err) {
      console.error("[face-register] R2 upload error:", err);
      // Non-fatal: face is already in Rekognition, photo is optional for admin view
    }

    // Update guard record
    await prisma.opsGuardia.update({
      where: { id: guardia.id },
      data: {
        faceIdRegistered: true,
        faceIdAwsId: registration.faceId,
        faceIdPhotoUrl: photoUrl,
        faceIdPhotoKey: photoKey,
        faceIdRegisteredAt: new Date(),
        faceIdConsentAt: new Date(),
        faceIdConsentRevoked: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "Face ID activado correctamente",
        guardiaId: guardia.id,
      },
    });
  } catch (error) {
    console.error("[marcacion/face-register] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
