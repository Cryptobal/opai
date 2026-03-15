import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 2)}-${code.slice(2, 4)}-${code.slice(4, 6)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId } = await params;

    // Generate unique code with retry
    let code: string;
    let attempts = 0;
    while (true) {
      code = generatePairingCode();
      const existing = await prisma.crmInstallation.findUnique({
        where: { pairingCode: code },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        return NextResponse.json(
          { success: false, error: "No se pudo generar un código único" },
          { status: 500 }
        );
      }
    }

    await prisma.crmInstallation.update({
      where: { id: installationId, tenantId: ctx.tenantId },
      data: { pairingCode: code },
    });

    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[devices/generate-code] Error:", msg);
    return NextResponse.json(
      { success: false, error: "Error al regenerar código de vinculación", detail: msg },
      { status: 500 }
    );
  }
}
