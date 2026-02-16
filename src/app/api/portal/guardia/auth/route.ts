import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { GuardSession } from "@/lib/guard-portal";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as {
      rut?: string;
      pin?: string;
    };

    if (!rut || !pin) {
      return NextResponse.json(
        { success: false, error: "RUT y PIN son requeridos" },
        { status: 401 },
      );
    }

    // Clean RUT: remove dots and dashes, uppercase
    const cleanRut = rut.replace(/[.\-]/g, "").toUpperCase();

    // Build all common format variants
    const rutBody = cleanRut.slice(0, -1);
    const rutDv = cleanRut.slice(-1);
    const rutWithDash = `${rutBody}-${rutDv}`;

    // Build dotted variant: 13.255.838-8
    let rutWithDots = rutWithDash;
    if (rutBody.length >= 2) {
      const reversed = rutBody.split("").reverse();
      const groups: string[] = [];
      for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
      }
      rutWithDots = `${groups.reverse().join(".")}-${rutDv}`;
    }

    // Find persona by RUT (try multiple formats)
    const persona = await prisma.opsPersona.findFirst({
      where: {
        OR: [
          { rut: cleanRut },
          { rut: rutWithDash },
          { rut: rutWithDots },
          { rut: rut },
        ],
      },
      include: {
        guardia: {
          include: {
            currentInstallation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!persona) {
      console.warn(`[Portal Guardia] RUT no encontrado: ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "RUT no encontrado. Verifique que su RUT esté registrado en el sistema." },
        { status: 401 },
      );
    }

    if (!persona.guardia) {
      console.warn(`[Portal Guardia] Persona sin guardia asociado: ${persona.id} / ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "Su RUT no está asociado a un guardia activo. Contacte a su supervisor." },
        { status: 401 },
      );
    }

    const guardia = persona.guardia;

    // Validate PIN — check hashed pin first, fallback to visible/plain pin
    const storedPin = guardia.marcacionPin;
    const visiblePin = guardia.marcacionPinVisible;

    if (!storedPin && !visiblePin) {
      console.warn(`[Portal Guardia] PIN no configurado para guardia: ${guardia.id} / ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "PIN no configurado. Contacte a su supervisor para que le asigne un PIN." },
        { status: 401 },
      );
    }

    let pinValid = false;

    // Try hashed PIN first
    if (storedPin) {
      if (storedPin.startsWith("$2")) {
        pinValid = await bcrypt.compare(pin, storedPin);
      } else {
        pinValid = storedPin === pin;
      }
    }

    // Fallback: try visible/plain PIN if hash didn't match
    if (!pinValid && visiblePin) {
      pinValid = visiblePin === pin;
    }

    if (!pinValid) {
      console.warn(`[Portal Guardia] PIN incorrecto para guardia: ${guardia.id} / ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "PIN incorrecto. Use el mismo PIN de marcación de asistencia." },
        { status: 401 },
      );
    }

    const session: GuardSession = {
      guardiaId: guardia.id,
      personaId: persona.id,
      tenantId: persona.tenantId,
      firstName: persona.firstName,
      lastName: persona.lastName,
      rut: persona.rut ?? cleanRut,
      code: guardia.code,
      currentInstallationId: guardia.currentInstallationId,
      currentInstallationName: guardia.currentInstallation?.name ?? null,
      authenticatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[Portal Guardia] Auth error:", error);
    return NextResponse.json(
      { success: false, error: "Error al autenticar" },
      { status: 500 },
    );
  }
}
