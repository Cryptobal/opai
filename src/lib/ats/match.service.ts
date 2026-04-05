import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import type { AtsMatchConfig } from "./config";

export interface MatchResult {
  score: number;
  detalle: {
    os10: number;
    distancia: number;
    disponibilidad: number;
    experiencia: number;
    renta: number;
    evaluacion: number;
  };
  califica: boolean;
}

export interface JobContext {
  installationLat?: number | null;
  installationLng?: number | null;
  requiereOS10: boolean;
  requiereMovilizacion: boolean;
  turno: string;
  rentaMin?: number | null;
  rentaMax?: number | null;
  experienciaMinAnios?: number | null;
  genero?: string | null;
}

const EMPTY_DETALLE = { os10: 0, distancia: 0, disponibilidad: 0, experiencia: 0, renta: 0, evaluacion: 0 };

export async function calcularMatchScore(
  guardiaId: string,
  job: JobContext,
  config: AtsMatchConfig,
): Promise<MatchResult> {
  const ahora = new Date();

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: {
      os10: true,
      os10ExpiresAt: true,
      experienciaAnios: true,
      turnosDisponibles: true,
      pretensionRentaMin: true,
      pretensionRentaMax: true,
      notaEvaluacion: true,
      persona: {
        select: { lat: true, lng: true, sex: true, hasMobilization: true },
      },
    },
  });

  if (!guardia) return { score: 0, detalle: { ...EMPTY_DETALLE }, califica: false };

  const detalle = { ...EMPTY_DETALLE };

  // Filtros obligatorios
  const os10Vigente = guardia.os10 === true && (!guardia.os10ExpiresAt || guardia.os10ExpiresAt > ahora);

  if (config.filtrosObligatorios.includes("os10") && job.requiereOS10 && !os10Vigente) {
    return { score: 0, detalle, califica: false };
  }
  if (job.requiereMovilizacion && !guardia.persona.hasMobilization) {
    return { score: 0, detalle, califica: false };
  }
  if (job.genero && guardia.persona.sex !== job.genero) {
    return { score: 0, detalle, califica: false };
  }

  // OS10
  if (!job.requiereOS10) {
    detalle.os10 = config.pesoOS10;
  } else if (os10Vigente) {
    detalle.os10 = config.pesoOS10;
  }

  // Distancia
  if (job.installationLat && job.installationLng && guardia.persona.lat && guardia.persona.lng) {
    const distM = haversineDistance(
      job.installationLat,
      job.installationLng,
      Number(guardia.persona.lat),
      Number(guardia.persona.lng),
    );
    const distKm = distM / 1000;
    if (distKm <= config.radioMaxKm) {
      const pct = Math.max(0, 1 - distKm / config.radioMaxKm);
      detalle.distancia = Math.round(config.pesoDistancia * pct);
    }
  } else {
    detalle.distancia = Math.round(config.pesoDistancia * 0.5);
  }

  // Disponibilidad — turno calza
  const turnosGuardia: string[] = guardia.turnosDisponibles ?? [];
  if (turnosGuardia.length === 0 || turnosGuardia.includes(job.turno)) {
    detalle.disponibilidad = config.pesoDisponibilidad;
  }

  // Experiencia
  const expGuardia = guardia.experienciaAnios ?? 0;
  const expReq = job.experienciaMinAnios ?? 0;
  if (expReq === 0) {
    detalle.experiencia = config.pesoExperiencia;
  } else if (expGuardia >= expReq) {
    const bonus = Math.min(1, expGuardia / (expReq * 2));
    detalle.experiencia = Math.round(config.pesoExperiencia * bonus);
  }

  // Renta — overlap de pretensión vs oferta
  const pretMin = guardia.pretensionRentaMin ?? 0;
  const pretMax = guardia.pretensionRentaMax ?? Infinity;
  const ofertaMin = job.rentaMin ?? 0;
  const ofertaMax = job.rentaMax ?? Infinity;
  if (pretMin <= ofertaMax && pretMax >= ofertaMin) {
    detalle.renta = config.pesoRenta;
  } else if (pretMin <= ofertaMax * 1.1) {
    detalle.renta = Math.round(config.pesoRenta * 0.5);
  }

  // Evaluación interna
  const evalMap: Record<string, number> = { bueno: 1, regular: 0.6, malo: 0 };
  const evalScore = evalMap[guardia.notaEvaluacion ?? ""] ?? 0.8;
  detalle.evaluacion = Math.round(config.pesoEvaluacion * evalScore);

  const score = Object.values(detalle).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, score), detalle, califica: true };
}

export async function resolverTopCandidatos(
  tenantId: string,
  job: JobContext,
  config: AtsMatchConfig,
  limit = 50,
): Promise<Array<{ guardiaId: string; score: number; detalle: MatchResult["detalle"] }>> {
  const guardias = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      status: "active",
      lifecycleStatus: { in: ["contratado", "postulante", "seleccionado", "te"] },
      isBlacklisted: false,
    },
    select: { id: true },
  });

  const results = await Promise.all(
    guardias.map(async (g) => {
      const match = await calcularMatchScore(g.id, job, config);
      return { guardiaId: g.id, ...match };
    }),
  );

  return results
    .filter((r) => r.califica)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ guardiaId, score, detalle }) => ({ guardiaId, score, detalle }));
}
