import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

function parseDeviceName(userAgent: string): string {
  // Try to extract device brand/model from user agent
  const mobileMatch = userAgent.match(
    /\b(iPhone|iPad|iPod|Samsung|Huawei|Xiaomi|OPPO|Vivo|OnePlus|Pixel|Motorola|LG|Sony|Nokia|Realme)[^\s;)]*/i
  );
  if (mobileMatch) return mobileMatch[0];

  const androidModel = userAgent.match(/;\s*([^;)]+)\s*Build\//);
  if (androidModel) return androidModel[1].trim();

  if (/iPad|Macintosh.*Mobile/i.test(userAgent)) return "iPad";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return "Android Device";
  if (/Windows/i.test(userAgent)) return "Windows Device";
  if (/Macintosh/i.test(userAgent)) return "Mac Device";
  if (/Linux/i.test(userAgent)) return "Linux Device";

  return "Unknown Device";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, deviceFingerprint, userAgent, screenResolution } = body;

    if (!code || !deviceFingerprint) {
      return NextResponse.json(
        { success: false, error: "Código y fingerprint son requeridos" },
        { status: 400 }
      );
    }

    // Find the pairing code
    const pairingCode = await safeAccessControlQuery(
      () =>
        prisma.accessControlPairingCode.findUnique({
          where: { code },
        }),
      null
    );

    if (!pairingCode) {
      return NextResponse.json(
        { success: false, error: "Código de vinculación no válido" },
        { status: 404 }
      );
    }

    // Check if already used
    if (pairingCode.usedAt) {
      return NextResponse.json(
        { success: false, error: "Código de vinculación ya utilizado" },
        { status: 410 }
      );
    }

    // Check if expired
    if (new Date() > pairingCode.expiresAt) {
      return NextResponse.json(
        { success: false, error: "Código de vinculación expirado" },
        { status: 410 }
      );
    }

    // Generate a secure device token
    const deviceToken = crypto.randomUUID() + crypto.randomUUID();
    const deviceName = parseDeviceName(userAgent || "");

    // Create the device record
    const device = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.create({
          data: {
            tenantId: pairingCode.tenantId,
            installationId: pairingCode.installationId,
            deviceFingerprint,
            deviceName,
            deviceToken,
            userAgent: userAgent || null,
            screenResolution: screenResolution || null,
          },
        }),
      null
    );

    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Las tablas de control de acceso aún no existen. Ejecute la migración de base de datos.",
        },
        { status: 503 }
      );
    }

    // Mark the pairing code as used
    await safeAccessControlQuery(
      () =>
        prisma.accessControlPairingCode.update({
          where: { id: pairingCode.id },
          data: {
            usedAt: new Date(),
            usedByDeviceId: device.id,
          },
        }),
      null
    );

    // Fetch installation info
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: pairingCode.installationId },
      select: { name: true, address: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: pairingCode.installationId,
        installationName: installation?.name ?? null,
        installationAddress: installation?.address ?? null,
        deviceId: device.id,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error pairing device:", error);
    return NextResponse.json(
      { success: false, error: "Error al vincular dispositivo" },
      { status: 500 }
    );
  }
}
