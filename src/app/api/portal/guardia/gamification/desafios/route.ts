import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    // Get the guard to obtain tenantId and installation
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true, currentInstallationId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const now = new Date();

    // Get active challenges: global (no installationId) or for the guard's installation
    const desafios = await prisma.gamificacionDesafio.findMany({
      where: {
        tenantId: guardia.tenantId,
        activo: true,
        fechaInicio: { lte: now },
        fechaFin: { gte: now },
        OR: [
          { installationId: null },
          ...(guardia.currentInstallationId
            ? [{ installationId: guardia.currentInstallationId }]
            : []),
        ],
      },
      orderBy: { fechaFin: "asc" },
    });

    // Get the guard's participations for these challenges
    const desafioIds = desafios.map((d) => d.id);
    const participaciones = desafioIds.length > 0
      ? await prisma.gamificacionDesafioParticipacion.findMany({
          where: {
            guardiaId,
            desafioId: { in: desafioIds },
          },
        })
      : [];

    const participacionMap = new Map(
      participaciones.map((p) => [p.desafioId, p]),
    );

    const data = desafios.map((d) => {
      const participacion = participacionMap.get(d.id);
      return {
        id: d.id,
        nombre: d.nombre,
        descripcion: d.descripcion,
        tipo: d.tipo,
        condicionTipo: d.condicionTipo,
        condicionValor: d.condicionValor,
        fechaInicio: d.fechaInicio,
        fechaFin: d.fechaFin,
        puntosRecompensa: d.puntosRecompensa,
        badgeId: d.badgeId,
        participacion: participacion
          ? {
              progreso: participacion.progreso,
              completado: participacion.completado,
              completadoAt: participacion.completadoAt,
              recompensaEntregada: participacion.recompensaEntregada,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Gamification desafios error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener desafíos" },
      { status: 500 },
    );
  }
}
