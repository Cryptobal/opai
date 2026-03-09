import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_PIN = "0000";

export async function POST(request: NextRequest) {
  try {
    const { deviceToken, pin } = await request.json();

    if (!deviceToken || !pin) {
      return NextResponse.json(
        { success: false, error: "Token y PIN requeridos" },
        { status: 400 },
      );
    }

    const device = await prisma.devicePairing.findFirst({
      where: { deviceToken },
      select: { tenantId: true },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no encontrado" },
        { status: 404 },
      );
    }

    const settingKey = `empresa:${device.tenantId}:portales.logoutPin`;
    const setting = await prisma.setting.findUnique({
      where: { key: settingKey },
      select: { value: true },
    });

    const correctPin = setting?.value || DEFAULT_PIN;
    const valid = pin === correctPin;

    return NextResponse.json({ success: valid });
  } catch (error) {
    console.error("[validate-logout-pin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar PIN" },
      { status: 500 },
    );
  }
}
