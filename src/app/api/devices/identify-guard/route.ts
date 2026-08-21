import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { formatPersonName } from "@/lib/personas";
import {
  bindDeviceCurrentGuard,
  pinMatches,
  rutLookupValues,
} from "@/lib/devices/device-guards";

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromToken(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no autorizado" },
        { status: 401 },
      );
    }

    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`devices-identify:${device.id}:${ip}`, {
      limit: 10,
      windowSeconds: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intenta de nuevo en un momento." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const body = await request.json().catch(() => null);
    const rut = typeof body?.rut === "string" ? body.rut : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!rut || pin.length < 4) {
      return NextResponse.json(
        { success: false, error: "RUT y PIN son requeridos" },
        { status: 400 },
      );
    }

    const rutValues = rutLookupValues(rut);
    if (rutValues.length === 0) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 },
      );
    }

    const persona = await prisma.opsPersona.findFirst({
      where: {
        tenantId: device.tenantId,
        rut: { in: rutValues },
        guardia: { isNot: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        firstName: true,
        lastName: true,
        guardia: {
          select: {
            id: true,
            status: true,
            isBlacklisted: true,
            marcacionPin: true,
            marcacionPinVisible: true,
          },
        },
      },
    });

    const guardia = persona?.guardia;
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 },
      );
    }

    if (guardia.status !== "active" || guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 },
      );
    }

    const ok = await pinMatches(pin, guardia.marcacionPin, guardia.marcacionPinVisible);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 },
      );
    }

    await bindDeviceCurrentGuard({
      deviceId: device.id,
      tenantId: device.tenantId,
      installationId: device.installationId,
      previousGuardId: device.currentGuardId,
      guardId: guardia.id,
    });

    const name = formatPersonName(persona.firstName, persona.lastName) || "Guardia";
    return NextResponse.json({
      success: true,
      data: { id: guardia.id, name },
    });
  } catch (error) {
    console.error("[devices/identify-guard] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al identificar guardia" },
      { status: 500 },
    );
  }
}
