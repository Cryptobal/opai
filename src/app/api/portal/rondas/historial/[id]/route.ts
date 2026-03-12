import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const guardiaId = sp.get("guardiaId");
    const tenantId = sp.get("tenantId");

    if (!id || !guardiaId || !tenantId) {
      return NextResponse.json(
        { success: false, error: "id, guardiaId y tenantId son requeridos" },
        { status: 400 },
      );
    }

    if (!UUID_RE.test(id) || !UUID_RE.test(guardiaId)) {
      return NextResponse.json(
        { success: false, error: "Formato de parámetros inválido" },
        { status: 400 },
      );
    }

    // Fetch ejecucion with ownership check in the same query
    const ej = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id,
        guardiaId,
        tenantId,
      },
      select: {
        id: true,
        isAdHoc: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMinutes: true,
        porcentajeCompletado: true,
        trustScore: true,
        checkpointsTotal: true,
        checkpointsCompletados: true,
        walkRoute: true,
        routeSnapshot: true,
        rondaTemplate: { select: { name: true } },
        installation: { select: { name: true } },
        marcaciones: {
          select: {
            checkpointId: true,
            timestamp: true,
            fotoEvidenciaUrl: true,
            status: true,
            checkpoint: {
              select: { name: true },
            },
          },
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!ej) {
      return NextResponse.json(
        { success: false, error: "Ronda no encontrada o no autorizada" },
        { status: 404 },
      );
    }

    type WalkPoint = { lat: number; lng: number };
    type RouteSnapshotPoint = {
      id: string;
      name: string;
      lat: number;
      lng: number;
      orderIndex: number;
      status: string;
    };

    const data = {
      ejecucionId: ej.id,
      templateName: ej.isAdHoc ? "Ronda Libre" : (ej.rondaTemplate?.name ?? "Ronda"),
      installationName: ej.installation?.name ?? "",
      completedAt: ej.completedAt?.toISOString() ?? null,
      startedAt: ej.startedAt?.toISOString() ?? null,
      durationMinutes: ej.durationMinutes ?? null,
      porcentajeCompletado: ej.porcentajeCompletado,
      trustScore: ej.trustScore,
      checkpointsTotal: ej.checkpointsTotal,
      checkpointsCompletados: ej.checkpointsCompletados,
      status: ej.status,
      isAdHoc: ej.isAdHoc,
      walkRoute: (ej.walkRoute as WalkPoint[] | null) ?? null,
      routeSnapshot: (ej.routeSnapshot as RouteSnapshotPoint[] | null) ?? null,
      marcaciones: ej.marcaciones.map((m) => ({
        checkpointId: m.checkpointId ?? null,
        checkpointName: m.checkpoint?.name ?? null,
        timestamp: m.timestamp.toISOString(),
        fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
        status: m.status,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("[Portal] Historial ronda detail error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener detalle de ronda" },
      { status: 500 },
    );
  }
}
