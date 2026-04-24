/**
 * GET /api/portal/cliente/instalaciones/[id]/guardias
 *
 * Devuelve el equipo de guardias ACTIVOS asignados a UNA instalación del cliente
 * junto con el estado cliente-friendly de su documentación.
 *
 * Privacidad: ver reglas en src/lib/portal-cliente-guardias.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requirePortalClienteAuth,
  ensureInstallationAccess,
} from "@/lib/portal-cliente";
import {
  loadGuardiasForInstallations,
  buildResumenGlobal,
} from "@/lib/portal-cliente-guardias";

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

    const { id: installationId } = await params;
    const ok = await ensureInstallationAccess(session, installationId);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    const guardias = await loadGuardiasForInstallations({
      tenantId: session.tenantId,
      installationIds: [installationId],
    });

    const resumenGlobal = buildResumenGlobal(guardias);

    return NextResponse.json({
      success: true,
      data: {
        guardias,
        resumen: {
          totalGuardias: resumenGlobal.totalGuardias,
          os10Vigente: resumenGlobal.os10Vigente,
          os10PorVencer: resumenGlobal.os10PorVencer,
          os10Vencido: resumenGlobal.os10Vencido,
        },
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] guardias instalación error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
