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

    // Find ALL personas matching this RUT (handle duplicates)
    const personas = await prisma.opsPersona.findMany({
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

    if (personas.length === 0) {
      console.warn(`[Portal Guardia] RUT no encontrado: ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "RUT no encontrado. Verifique que su RUT esté registrado en el sistema." },
        { status: 401 },
      );
    }

    // Prioritize: active guardia > any guardia with PIN > first with guardia
    const withGuardia = personas.filter((p) => p.guardia);
    if (withGuardia.length === 0) {
      console.warn(`[Portal Guardia] Persona(s) sin guardia asociado: ${rutWithDash}`);
      return NextResponse.json(
        { success: false, error: "Su RUT no está asociado a un guardia activo. Contacte a su supervisor." },
        { status: 401 },
      );
    }

    // Sort: active guardias first, then ones with PIN configured
    withGuardia.sort((a, b) => {
      const aActive = a.guardia!.status === "active" ? 1 : 0;
      const bActive = b.guardia!.status === "active" ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      const aHasPin = (a.guardia!.marcacionPin || a.guardia!.marcacionPinVisible) ? 1 : 0;
      const bHasPin = (b.guardia!.marcacionPin || b.guardia!.marcacionPinVisible) ? 1 : 0;
      return bHasPin - aHasPin;
    });

    const persona = withGuardia[0];
    const guardia = persona.guardia!;

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
