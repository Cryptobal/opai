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

    // Look up the configured PIN. Try in order:
    //   1. New prefixed key scoped to device's tenant
    //      (`empresa:{tenantId}:portales.logoutPin`)
    //   2. Legacy unprefixed key scoped to device's tenant
    //      (`portales.logoutPin`)
    //   3. Legacy unprefixed key with tenantId=NULL — pre-multi-tenant
    //      global setting that the 20260406 migration left in place.
    //
    // Using findFirst (not findUnique) avoids issues with Prisma's
    // composite unique selectors when the same upsert path was used
    // under different tenant scopes over time.
    const newKey = `empresa:${device.tenantId}:portales.logoutPin`;
    const legacyKey = `portales.logoutPin`;

    let setting = await prisma.setting.findFirst({
      where: { tenantId: device.tenantId, key: newKey },
      select: { value: true },
    });
    let source: "new-scoped" | "legacy-scoped" | "legacy-global" | "none" =
      setting ? "new-scoped" : "none";

    if (!setting) {
      setting = await prisma.setting.findFirst({
        where: { tenantId: device.tenantId, key: legacyKey },
        select: { value: true },
      });
      if (setting) source = "legacy-scoped";
    }

    if (!setting) {
      setting = await prisma.setting.findFirst({
        where: { tenantId: null, key: legacyKey },
        select: { value: true },
      });
      if (setting) source = "legacy-global";
    }

    const configured = normalizePin(setting?.value);
    const submitted = normalizePin(rawPin);
    const correctPin = configured || DEFAULT_PIN;
    const valid = submitted.length === 4 && submitted === correctPin;

    // Diagnostic logging — never log actual PIN values. On mismatch we
    // also probe whether the PIN exists under a *different* tenant, which
    // is the most common real-world cause (admin saves PIN as tenant A,
    // device paired to installation under tenant B).
    if (!valid) {
      const crossTenant = await prisma.setting.findFirst({
        where: {
          key: { contains: "portales.logoutPin" },
          NOT: { tenantId: device.tenantId },
        },
        select: { tenantId: true, key: true },
      });
      console.warn("[validate-logout-pin] mismatch", {
        tenantId: device.tenantId,
        deviceTokenSuffix: String(deviceToken).slice(-8),
        source,
        configuredLength: configured.length,
        submittedLength: submitted.length,
        usingDefault: !configured,
        crossTenantHit: crossTenant
          ? { tenantId: crossTenant.tenantId, key: crossTenant.key }
          : null,
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
