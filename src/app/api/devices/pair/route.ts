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

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Código requerido" },
        { status: 400 }
      );
    }

    // Metadata is nice-to-have, not blocking
    const meta = metadata ?? {};

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
        { success: false, error: "Código inválido" },
        { status: 400 }
      );
    }

    const deviceToken = globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
    const ua = meta.userAgent || "unknown";
    const deviceModel = parseDeviceModel(ua);
    const androidVersionMatch = ua.match(/Android\s+([\d.]+)/);
    const androidVersion = androidVersionMatch ? androidVersionMatch[1] : null;
    const browserVersionMatch = ua.match(/Chrome\/([\d.]+)/);
    const browserVersion = browserVersionMatch ? browserVersionMatch[1] : null;
    const screenResolution = meta.screenWidth && meta.screenHeight
      ? `${meta.screenWidth}x${meta.screenHeight}@${meta.devicePixelRatio || 1}`
      : null;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Create a new DevicePairing record (code is NOT consumed)
    const device = await prisma.devicePairing.create({
      data: {
        tenantId: installation.tenantId,
        installationId: installation.id,
        deviceToken,
        linkedAt: new Date(),
        name: deviceModel,
        deviceModel,
        androidVersion,
        browserVersion,
        screenResolution,
        cpuCores: meta.cpuCores ?? null,
        ramGB: meta.ramGB ?? null,
        userAgent: ua,
        deviceFingerprint: meta.timezone
          ? `${meta.language || ""}|${meta.timezone}|${screenResolution || ""}`
          : null,
        pairingLatitude: meta.latitude ?? null,
        pairingLongitude: meta.longitude ?? null,
        lastSeenAt: new Date(),
        lastBatteryLevel: meta.batteryLevel ?? null,
        lastConnectionType: meta.connectionType ?? null,
        lastIpAddress: ip,
        portalRondasEnabled: true,
        portalAccesoEnabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: installation.id,
        installationName: installation.name || "",
        installationAddress: installation.address || "",
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
