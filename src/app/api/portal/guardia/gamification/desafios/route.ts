import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

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

    // Get the guard's current installation
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId },
      select: { currentInstallationId: true },
    });

    const now = new Date();

    // Get active challenges: global (no installationId) or for the guard's installation
    const desafios = await prisma.gamificacionDesafio.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        activo: true,
        fechaInicio: { lte: now },
        fechaFin: { gte: now },
        OR: [
          { installationId: null },
          ...(guardia?.currentInstallationId
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
            guardiaId: guardAuth.guardiaId,
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
