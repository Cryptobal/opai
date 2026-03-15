import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

function parseDeviceName(userAgent: string): string {
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

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Código requerido" },
        { status: 400 }
      );
    }

    // Normalize: uppercase, remove spaces. Support XX-XX-XX (new) and XXX-XXX (legacy)
    const stripped = code.toUpperCase().replace(/[\s-]/g, "").slice(0, 6);
    const formattedCode = `${stripped.slice(0, 2)}-${stripped.slice(2, 4)}-${stripped.slice(4, 6)}`;
    const legacyCode = `${stripped.slice(0, 3)}-${stripped.slice(3)}`;

    // Find installation by permanent pairing code (try both formats for backward compat)
    const installation = await prisma.crmInstallation.findFirst({
      where: {
        OR: [{ pairingCode: formattedCode }, { pairingCode: legacyCode }],
      },
      select: { id: true, name: true, address: true, tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Código de vinculación no válido" },
        { status: 404 }
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
            tenantId: installation.tenantId,
            installationId: installation.id,
            deviceFingerprint: deviceFingerprint || `anon_${Date.now()}`,
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

    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: installation.id,
        installationName: installation.name ?? null,
        installationAddress: installation.address ?? null,
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
