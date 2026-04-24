/**
 * GET /api/portal/cliente/reportes/[id]
 *
 * Devuelve el estado y URLs del reporte. Usado por la UI para pollear tras
 * `POST /generar`.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const reporte = await prisma.portalClienteReporte.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        accountId: session.accountId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        period: true,
        pdfUrl: true,
        xlsxUrl: true,
        errorMessage: true,
        params: true,
        requestedAt: true,
        generatedAt: true,
        installationId: true,
      },
    });

    if (!reporte) {
      return NextResponse.json(
        { success: false, error: "Reporte no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: reporte });
  } catch (error) {
    console.error("[portal-cliente/reportes/:id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
