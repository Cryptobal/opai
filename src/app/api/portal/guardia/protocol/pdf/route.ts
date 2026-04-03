import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/* ── GET /api/portal/guardia/protocol/pdf ────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      select: { id: true, currentInstallationId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    if (!guardia.currentInstallationId) {
      return NextResponse.json(
        { success: false, error: "Guardia no tiene instalación asignada" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "La descarga de protocolo en PDF estará disponible próximamente",
        installationId: guardia.currentInstallationId,
      },
      { status: 501 },
    );
  } catch (error) {
    console.error("[Portal Guardia] Protocol PDF GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF del protocolo" },
      { status: 500 },
    );
  }
}
