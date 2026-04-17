/**
 * API Route: /api/portal/cliente/rondas/[id]
 * GET — Get ronda execution detail including checkpoints and incidentes.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const ejecucion = await prisma.opsRondaEjecucion.findUnique({
      where: { id },
      include: {
        marcaciones: {
          select: {
            id: true,
            checkpointId: true,
            timestamp: true,
            lat: true,
            lng: true,
            geoValidada: true,
            fotoEvidenciaUrl: true,
            note: true,
            status: true,
          },
          orderBy: { timestamp: "asc" },
        },
        incidentes: {
          select: {
            id: true,
            tipo: true,
            descripcion: true,
            fotoUrl: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!ejecucion) {
      return NextResponse.json(
        { success: false, error: "No encontrado" },
        { status: 404 }
      );
    }

    // Verify the installation belongs to this account
    if (!ejecucion.installationId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    const inst = await prisma.crmInstallation.findFirst({
      where: {
        id: ejecucion.installationId,
        accountId: session.accountId,
        tenantId: session.tenantId,
      },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: ejecucion });
  } catch (error) {
    console.error("[Portal Cliente] rondas/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
