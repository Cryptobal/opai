/**
 * API Route: /api/portal/cliente/rondas/[id]
 * GET — Get ronda execution detail including checkpoints and incidentes.
 *
 * Seguridad (PR2): usamos `findFirst` con filtros compuestos de
 * `tenantId` + `installation.accountId` para que una ronda de otro tenant
 * devuelva 404 sin revelar su existencia (antes hacía findUnique y
 * diferenciaba entre 404 y 403, lo que permitía enumerar IDs).
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

    const ejecucion = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        installationId: { not: null },
        installation: {
          is: {
            accountId: session.accountId,
            tenantId: session.tenantId,
          },
        },
      },
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

    return NextResponse.json({ success: true, data: ejecucion });
  } catch (error) {
    console.error("[Portal Cliente] rondas/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
