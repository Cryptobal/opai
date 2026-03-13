import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as { rut?: string; pin?: string };

    if (!rut || !pin) {
      return NextResponse.json(
        { success: false, error: "RUT y PIN son requeridos" },
        { status: 401 },
      );
    }

    // Clean RUT: remove dots and dashes, uppercase
    const cleanRut = rut.replace(/[.\-]/g, "").toUpperCase();
    const rutBody = cleanRut.slice(0, -1);
    const rutDv = cleanRut.slice(-1);
    const rutWithDash = `${rutBody}-${rutDv}`;

    // Dotted variant
    let rutWithDots = rutWithDash;
    if (rutBody.length >= 2) {
      const reversed = rutBody.split("").reverse();
      const groups: string[] = [];
      for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
      }
      rutWithDots = `${groups.reverse().join(".")}-${rutDv}`;
    }

    const personas = await prisma.opsPersona.findMany({
      where: {
        OR: [
          { rut: cleanRut },
          { rut: rutWithDash },
          { rut: rutWithDots },
          { rut },
        ],
      },
      include: {
        guardia: {
          include: {
            currentInstallation: { select: { id: true, name: true } },
            asignaciones: {
              include: { installation: { select: { id: true, name: true } } },
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (personas.length === 0) {
      return NextResponse.json(
        { success: false, error: "RUT no encontrado" },
        { status: 401 },
      );
    }

    const withGuardia = personas.filter((p) => p.guardia);
    if (withGuardia.length === 0) {
      return NextResponse.json(
        { success: false, error: "RUT no asociado a guardia activo" },
        { status: 401 },
      );
    }

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

    if (guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 },
      );
    }

    const storedPin = guardia.marcacionPin;
    const visiblePin = guardia.marcacionPinVisible;

    if (!storedPin && !visiblePin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado. Contacte a su supervisor." },
        { status: 401 },
      );
    }

    let pinValid = false;
    if (storedPin) {
      pinValid = storedPin.startsWith("$2")
        ? await bcrypt.compare(pin, storedPin)
        : storedPin === pin;
    }
    if (!pinValid && visiblePin) {
      pinValid = visiblePin === pin;
    }

    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "PIN incorrecto" },
        { status: 401 },
      );
    }

    // Build installations list for selector (from active asignaciones)
    const seenIds = new Set<string>();
    const installations: { id: string; name: string }[] = [];
    for (const asig of guardia.asignaciones ?? []) {
      if (!seenIds.has(asig.installation.id)) {
        seenIds.add(asig.installation.id);
        installations.push({
          id: asig.installation.id,
          name: asig.installation.name,
        });
      }
    }

    // Add current installation if not already in list
    if (guardia.currentInstallationId && guardia.currentInstallation) {
      if (!seenIds.has(guardia.currentInstallationId)) {
        installations.unshift({
          id: guardia.currentInstallation.id,
          name: guardia.currentInstallation.name,
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        tenantId: persona.tenantId,
        nombre: formatPersonName(persona.firstName, persona.lastName),
        currentInstallationId: guardia.currentInstallationId,
        installations,
      },
    });

    after(async () => {
      const { trackPortalAccess } = await import("@/lib/triggers/portal-access-tracker");
      await trackPortalAccess(guardia.id, "rondas");
    });

    return response;
  } catch (error) {
    console.error("[Portal Rondas] Auth error:", error);
    return NextResponse.json(
      { success: false, error: "Error al autenticar" },
      { status: 500 },
    );
  }
}
