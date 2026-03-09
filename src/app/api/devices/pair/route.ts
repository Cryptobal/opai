import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDeviceModel(userAgent: string): string {
  const androidModel = userAgent.match(/;\s*([^;)]+)\s*Build\//);
  if (androidModel) return androidModel[1].trim();
  const mobileMatch = userAgent.match(
    /\b(Samsung|Huawei|Xiaomi|OPPO|Vivo|OnePlus|Pixel|Motorola|LG|Sony|Nokia|Realme)[^\s;)]*/i
  );
  if (mobileMatch) return mobileMatch[0];
  if (/Android/i.test(userAgent)) return "Android Device";
  return "Unknown Device";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, metadata } = body;

    if (!code || !metadata?.userAgent) {
      return NextResponse.json(
        { success: false, error: "Código y metadata requeridos" },
        { status: 400 }
      );
    }

    const normalizedCode = code.toUpperCase().replace(/\s/g, "");

    const device = await prisma.devicePairing.findFirst({
      where: {
        pairingCode: normalizedCode,
        deviceToken: null,
        pairingCodeExpiresAt: { gt: new Date() },
      },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: "Código inválido o expirado" },
        { status: 400 }
      );
    }

    const deviceToken = globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
    const deviceModel = parseDeviceModel(metadata.userAgent);
    const androidVersionMatch = metadata.userAgent.match(/Android\s+([\d.]+)/);
    const androidVersion = androidVersionMatch ? androidVersionMatch[1] : null;
    const browserVersionMatch = metadata.userAgent.match(/Chrome\/([\d.]+)/);
    const browserVersion = browserVersionMatch ? browserVersionMatch[1] : null;
    const screenResolution = metadata.screenWidth && metadata.screenHeight
      ? `${metadata.screenWidth}x${metadata.screenHeight}@${metadata.devicePixelRatio || 1}`
      : null;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    await prisma.devicePairing.update({
      where: { id: device.id },
      data: {
        pairingCode: null,
        pairingCodeExpiresAt: null,
        deviceToken,
        linkedAt: new Date(),
        name: deviceModel,
        deviceModel,
        androidVersion,
        browserVersion,
        screenResolution,
        cpuCores: metadata.cpuCores ?? null,
        ramGB: metadata.ramGB ?? null,
        userAgent: metadata.userAgent,
        deviceFingerprint: metadata.timezone
          ? `${metadata.language || ""}|${metadata.timezone}|${screenResolution || ""}`
          : null,
        pairingLatitude: metadata.latitude ?? null,
        pairingLongitude: metadata.longitude ?? null,
        lastSeenAt: new Date(),
        lastBatteryLevel: metadata.batteryLevel ?? null,
        lastConnectionType: metadata.connectionType ?? null,
        lastIpAddress: ip,
      },
    });

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: device.installationId },
      select: { id: true, name: true, address: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: device.installationId,
        installationName: installation?.name || "",
        installationAddress: installation?.address || "",
        deviceId: device.id,
      },
    });
  } catch (error) {
    console.error("[devices/pair] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al vincular dispositivo" },
      { status: 500 }
    );
  }
}
