import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  evaluateLogoutPin,
  pickLogoutPinValue,
  PIN_NOT_CONFIGURED_MESSAGE,
} from "@/lib/portales-logout-pin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const deviceToken = body?.deviceToken;
    const rawPin = body?.pin;

    if (!deviceToken || !rawPin) {
      return NextResponse.json(
        { success: false, error: "Token y PIN requeridos", code: "MISSING_FIELDS" },
        { status: 400 },
      );
    }

    const device = await prisma.devicePairing.findFirst({
      where: { deviceToken },
      select: {
        tenantId: true,
        installation: { select: { tenantId: true } },
      },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no encontrado", code: "DEVICE_NOT_FOUND" },
        { status: 404 },
      );
    }

    const tenantIds = [...new Set(
      [device.installation?.tenantId, device.tenantId].filter(
        (id): id is string => Boolean(id),
      ),
    )];

    const settings = await prisma.setting.findMany({
      where: {
        key: { contains: "portales.logoutPin" },
        OR: [
          ...(tenantIds.length > 0 ? [{ tenantId: { in: tenantIds } }] : []),
          { tenantId: null },
        ],
      },
      select: { key: true, value: true, tenantId: true },
    });

    const configured = pickLogoutPinValue(settings, tenantIds);
    const result = evaluateLogoutPin(configured, rawPin);

    if (!result.ok) {
      console.warn("[validate-logout-pin] mismatch", {
        deviceTenantId: device.tenantId,
        installationTenantId: device.installation?.tenantId ?? null,
        deviceTokenSuffix: String(deviceToken).slice(-8),
        settingsFound: settings.length,
        configuredLength: configured.length,
        code: result.code,
      });
      return NextResponse.json({
        success: false,
        code: result.code,
        error: result.error ?? (result.code === "PIN_NOT_CONFIGURED"
          ? PIN_NOT_CONFIGURED_MESSAGE
          : undefined),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[validate-logout-pin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar PIN", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
