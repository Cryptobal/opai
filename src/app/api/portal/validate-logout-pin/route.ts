import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_PIN = "0000";

/**
 * Normalize a PIN for comparison: keep digits only, max 4 chars.
 * Defense against accidental whitespace/CRLF/zero-width chars introduced via
 * paste or legacy migration. Matches the regex used by the config UI:
 *   `e.target.value.replace(/[^0-9]/g, "").slice(0, 4)`
 */
function normalizePin(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/[^0-9]/g, "").slice(0, 4);
}

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
      select: { tenantId: true },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no encontrado", code: "DEVICE_NOT_FOUND" },
        { status: 404 },
      );
    }

    // Look up the configured PIN. Try the new prefixed key first
    // (`empresa:{tenantId}:portales.logoutPin`), then fall back to the
    // legacy unprefixed key (`portales.logoutPin`) — mirroring the GET
    // handler in /api/configuracion/empresa which already does this dual
    // lookup. Always filter by tenantId for multi-tenant isolation.
    const newKey = `empresa:${device.tenantId}:portales.logoutPin`;
    const legacyKey = `portales.logoutPin`;

    let setting = await prisma.setting.findUnique({
      where: { tenantId_key: { tenantId: device.tenantId, key: newKey } },
      select: { value: true },
    });

    if (!setting) {
      setting = await prisma.setting.findUnique({
        where: { tenantId_key: { tenantId: device.tenantId, key: legacyKey } },
        select: { value: true },
      });
    }

    const configured = normalizePin(setting?.value);
    const submitted = normalizePin(rawPin);
    const correctPin = configured || DEFAULT_PIN;
    const valid = submitted.length === 4 && submitted === correctPin;

    // Diagnostic logging — never log the actual PIN values, only lengths
    // and which key matched. Useful for production debugging without leaking.
    if (!valid) {
      console.warn("[validate-logout-pin] mismatch", {
        tenantId: device.tenantId,
        hasSetting: !!setting,
        configuredLength: configured.length,
        submittedLength: submitted.length,
        usingDefault: !configured,
      });
    }

    return NextResponse.json({
      success: valid,
      ...(valid ? {} : { code: "PIN_MISMATCH" }),
    });
  } catch (error) {
    console.error("[validate-logout-pin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar PIN", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
