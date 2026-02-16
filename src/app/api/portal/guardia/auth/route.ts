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

    // Also build formatted variants to search
    // e.g. "12345678-5", "12.345.678-5"
    const rutBody = cleanRut.slice(0, -1);
    const rutDv = cleanRut.slice(-1);
    const rutWithDash = `${rutBody}-${rutDv}`;

    // Find persona by RUT (try multiple formats)
    const persona = await prisma.opsPersona.findFirst({
      where: {
        OR: [
          { rut: cleanRut },
          { rut: rutWithDash },
          { rut: rut }, // exact as provided
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

    if (!persona || !persona.guardia) {
      return NextResponse.json(
        { success: false, error: "RUT no encontrado o no es guardia activo" },
        { status: 401 },
      );
    }

    const guardia = persona.guardia;

    // Validate PIN
    const storedPin = guardia.marcacionPin;
    if (!storedPin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado. Contacte a su supervisor." },
        { status: 401 },
      );
    }

    let pinValid = false;
    if (storedPin.startsWith("$2")) {
      // bcrypt hash
      pinValid = await bcrypt.compare(pin, storedPin);
    } else {
      // Plain text comparison
      pinValid = storedPin === pin;
    }

    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "PIN incorrecto" },
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
