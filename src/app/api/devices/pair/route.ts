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

    // Normalize: uppercase, remove non-alphanumeric, ensure XXX-XXX format
    const stripped = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (stripped.length !== 6) {
      return NextResponse.json(
        { success: false, error: "El código debe tener 6 caracteres" },
        { status: 400 }
      );
    }
    const formattedCode = `${stripped.slice(0, 3)}-${stripped.slice(3)}`;

    // Find installation by permanent pairing code
    const installation = await prisma.crmInstallation.findUnique({
      where: { pairingCode: formattedCode },
      select: { id: true, name: true, address: true, tenantId: true },
    });

    if (!installation) {
      console.warn(`[devices/pair] Code not found: ${formattedCode}`);
      return NextResponse.json(
        { success: false, error: "Código no encontrado. Verifica con tu supervisor." },
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
