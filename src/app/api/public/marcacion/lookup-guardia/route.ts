/**
 * GET /api/public/marcacion/lookup-guardia?rut=...&installationId=...
 *
 * Looks up a guardia by RUT and determines their next marca type (entrada/salida).
 * Used in Step 1 of the new Portal Marcación flow.
 * Public route — no session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPersonName, normalizeRut } from "@/lib/personas";

/**
 * Normalizes RUT for DB lookup.
 * Handles: "13255838-8", "13.255.838-8", "132558388" (sin guión) → "13255838-8"
 */
function prepareRutForLookup(raw: string): string {
  let clean = normalizeRut(raw.trim()); // removes dots, uppercases, keeps dash
  // Auto-insert dash before last char if missing
  if (!clean.includes("-") && clean.length >= 2) {
    clean = clean.slice(0, -1) + "-" + clean.slice(-1);
  }
  return clean;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawRut = searchParams.get("rut");
    const installationId = searchParams.get("installationId");

    if (!rawRut || !installationId || installationId === "undefined" || installationId === "null") {
      return NextResponse.json(
        { success: false, error: "Dispositivo no emparejado. Recarga el portal." },
        { status: 400 }
      );
    }

    const rut = prepareRutForLookup(rawRut);

    // Find installation
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, isActive: true },
      select: { id: true, tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Find persona by RUT, including their guardia relation
    const persona = await prisma.opsPersona.findFirst({
      where: {
        tenantId: installation.tenantId,
        rut: { equals: rut, mode: "insensitive" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            faceIdRegistered: true,
            faceIdPhotoUrl: true,
            faceIdConsentRevoked: true,
          },
        },
      },
    });

    if (!persona?.guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado. Verifica tu RUT." },
        { status: 404 }
      );
    }

    const guardia = persona.guardia;

    // Verify guard is active
    if (!["seleccionado", "contratado"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json(
        { success: false, error: "Guardia no activo en el sistema" },
        { status: 403 }
      );
    }

    if (guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 }
      );
    }

    // Determine next marca type based on last marca today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ultimaMarca = await prisma.opsMarcacion.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId,
        timestamp: { gte: today, lt: tomorrow },
        deletedAt: null,
      },
      orderBy: { timestamp: "desc" },
      select: { tipo: true },
    });

    // If last marca was entrada → next is salida, and viceversa
    let nextTipo: "entrada" | "salida" = "entrada";
    if (ultimaMarca?.tipo === "entrada") {
      nextTipo = "salida";
    }

    return NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        name: formatPersonName(persona.firstName, persona.lastName),
        photoUrl: guardia.faceIdPhotoUrl ?? null, // Use face ID reference photo as profile photo
        faceIdRegistered: guardia.faceIdRegistered,
        faceIdPhotoUrl: guardia.faceIdPhotoUrl ?? null,
        faceIdConsentRevoked: guardia.faceIdConsentRevoked,
        nextTipo,
      },
    });
  } catch (error) {
    console.error("[lookup-guardia] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
