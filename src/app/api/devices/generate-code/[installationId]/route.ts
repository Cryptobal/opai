import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId } = await params;

    let body: { portalRondasEnabled?: boolean; portalAccesoEnabled?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is valid
    }

    const portalRondasEnabled = body.portalRondasEnabled ?? true;
    const portalAccesoEnabled = body.portalAccesoEnabled ?? true;

    await prisma.devicePairing.deleteMany({
      where: {
        installationId,
        tenantId: ctx.tenantId,
        deviceToken: null,
        pairingCode: { not: null },
      },
    });

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    const devicePairing = await prisma.devicePairing.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        pairingCode: code,
        pairingCodeExpiresAt: expiresAt,
        portalRondasEnabled,
        portalAccesoEnabled,
        linkedByUserId: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        code,
        expiresAt: expiresAt.toISOString(),
        devicePairingId: devicePairing.id,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[devices/generate-code] Error:", msg);
    return NextResponse.json(
      { success: false, error: "Error al generar código de vinculación", detail: msg },
      { status: 500 }
    );
  }
}
