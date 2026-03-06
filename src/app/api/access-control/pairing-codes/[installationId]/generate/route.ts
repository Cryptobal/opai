import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    // Look up the installation to get tenantId
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Invalidate any existing unused codes for this installation
    await safeAccessControlQuery(
      () =>
        prisma.accessControlPairingCode.deleteMany({
          where: {
            installationId,
            usedAt: null,
          },
        }),
      { count: 0 }
    );

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const pairingCode = await safeAccessControlQuery(
      () =>
        prisma.accessControlPairingCode.create({
          data: {
            tenantId: installation.tenantId,
            installationId,
            code,
            expiresAt,
          },
        }),
      null
    );

    if (!pairingCode) {
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
      data: { code: pairingCode.code, expiresAt: pairingCode.expiresAt },
    });
  } catch (error) {
    console.error("[AccessControl] Error generating pairing code:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar código de vinculación" },
      { status: 500 }
    );
  }
}
