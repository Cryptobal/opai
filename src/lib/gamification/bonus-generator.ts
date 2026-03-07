import { prisma } from "@/lib/prisma";

export async function generarSugerenciasBono(
  tenantId: string,
  fondoId: string,
): Promise<number> {
  const fondo = await prisma.gamificacionFondoPremio.findUnique({
    where: { id: fondoId },
  });

  if (!fondo || fondo.status !== "activo") return 0;

  const periodo = `${fondo.fechaInicio.getFullYear()}-${String(fondo.fechaInicio.getMonth() + 1).padStart(2, "0")}`;

  const whereClause: Record<string, unknown> = {
    tenantId,
    periodo,
    periodoTipo: "mensual",
  };
  if (fondo.installationId) {
    whereClause.installationId = fondo.installationId;
  }

  const scores = await prisma.gamificacionScoreGuardia.findMany({
    where: whereClause,
    orderBy: { trustScore: "desc" },
    select: { guardiaId: true, puntosNetos: true },
  });

  if (scores.length === 0) return 0;

  const distribucion = (fondo.distribucion as Array<{ posicion: number; porcentaje: number }>) ?? [];

  const sugerencias = distribucion
    .filter((d) => d.posicion <= scores.length)
    .map((d) => {
      const guardia = scores[d.posicion - 1];
      return {
        tenantId,
        fondoId: fondo.id,
        guardiaId: guardia.guardiaId,
        posicionRanking: d.posicion,
        puntajePeriodo: guardia.puntosNetos,
        montoSugeridoClp: Math.round(fondo.montoTotalClp * (d.porcentaje / 100)),
      };
    });

  if (sugerencias.length > 0) {
    await prisma.gamificacionSugerenciaBono.createMany({
      data: sugerencias,
      skipDuplicates: true,
    });
  }

  return sugerencias.length;
}
