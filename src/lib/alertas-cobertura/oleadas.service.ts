/**
 * Generador de Oleadas — Alertas de Cobertura
 *
 * Genera oleadas escalonadas por anillos de distancia.
 * Las oleadas se generan al CREAR la alerta y se guardan como JSON (oleadasConfig).
 * No se recalculan después salvo en re-alerta.
 */

import { prisma } from "@/lib/prisma";
import { getAlertaCoberturaConfig } from "./config";
import {
  resolverCandidatos,
  resolverTurnoSaliente,
  type GuardiaCandidate,
} from "./segmentacion.service";

export interface Oleada {
  numero: number;
  tipo: "TURNO_SALIENTE" | "INTERNO_CERCANO" | "INTERNO_MEDIO" | "INTERNO_LEJANO" | "EXTERNO";
  radioMinKm: number;
  radioMaxKm: number;
  esperaMin: number;
  guardiaIds: string[];
  guardiaCount: number;
}

export interface OleadasPreview extends Oleada {
  guardias: { id: string; nombre: string; distanciaKm: number }[];
}

export interface GenerarOleadasParams {
  tenantId: string;
  installationId: string;
  instalacionLat: number;
  instalacionLng: number;
  fechaInicio: Date;
  fechaFin: Date;
  radioKm: number;
  genero: string | null;
  modalidad: string;
  requiereOS10: boolean;
  soloDealer: boolean;
  soloConMovilizacion: boolean;
}

interface OleadasResult {
  oleadas: Oleada[];
  previews: OleadasPreview[];
  totalGuardias: number;
  tiempoEstimadoMin: number;
  guardiasConCoordenadas: number;
  guardiasSinCoordenadas: number;
}

export async function generarOleadas(params: GenerarOleadasParams): Promise<OleadasResult> {
  const config = await getAlertaCoberturaConfig(params.tenantId);
  const oleadas: Oleada[] = [];
  const previews: OleadasPreview[] = [];
  const guardiaIdsUsados = new Set<string>();
  let oleadaNumero = 0;

  // Contar guardias sin coordenadas para el reporte
  const guardiasSinCoordenadas = await contarGuardiasSinCoordenadas(params.tenantId);

  // NOTA: Oleada "Turno Saliente" fue removida — un guardia no puede doblar turno (prohibido).
  // Los guardias que están terminando turno en la instalación NO son candidatos.

  // === OLEADAS INTERNAS: por anillos de distancia ===
  const radioMaxInterno = Math.max(params.radioKm, config.oleada3RadioKm);
  const todosInternos = await resolverCandidatos({
    tenantId: params.tenantId,
    installationId: params.installationId,
    instalacionLat: params.instalacionLat,
    instalacionLng: params.instalacionLng,
    radioKm: radioMaxInterno,
    fechaInicio: params.fechaInicio,
    fechaFin: params.fechaFin,
    genero: params.genero,
    modalidad: params.modalidad,
    requiereOS10: params.requiereOS10,
    soloDealer: false,
    soloConMovilizacion: params.soloConMovilizacion,
    fase: "INTERNA",
  });

  const guardiasConCoordenadas = todosInternos.length;

  // Anillo 1: Cercanos (0 - oleada1RadioKm)
  agregarOleadaAnillo(
    todosInternos,
    guardiaIdsUsados,
    oleadas,
    previews,
    oleadaNumero,
    "INTERNO_CERCANO",
    0,
    config.oleada1RadioKm,
    config.oleada1EsperaMin,
  );
  if (oleadas.length > oleadaNumero + (config.incluirTurnoSaliente ? 1 : 0)) oleadaNumero++;

  // Anillo 2: Medianos (oleada1RadioKm - oleada2RadioKm)
  const preCountMedio = oleadas.length;
  agregarOleadaAnillo(
    todosInternos,
    guardiaIdsUsados,
    oleadas,
    previews,
    oleadaNumero,
    "INTERNO_MEDIO",
    config.oleada1RadioKm,
    config.oleada2RadioKm,
    config.oleada2EsperaMin,
  );
  if (oleadas.length > preCountMedio) oleadaNumero++;

  // Anillo 3: Lejanos (oleada2RadioKm - oleada3RadioKm)
  const preCountLejano = oleadas.length;
  agregarOleadaAnillo(
    todosInternos,
    guardiaIdsUsados,
    oleadas,
    previews,
    oleadaNumero,
    "INTERNO_LEJANO",
    config.oleada2RadioKm,
    config.oleada3RadioKm,
    config.oleada3EsperaMin,
  );
  if (oleadas.length > preCountLejano) oleadaNumero++;

  // === OLEADA EXTERNA ===
  const externos = await resolverCandidatos({
    tenantId: params.tenantId,
    installationId: params.installationId,
    instalacionLat: params.instalacionLat,
    instalacionLng: params.instalacionLng,
    radioKm: params.radioKm,
    fechaInicio: params.fechaInicio,
    fechaFin: params.fechaFin,
    genero: params.genero,
    modalidad: params.modalidad,
    requiereOS10: params.requiereOS10,
    soloDealer: params.soloDealer,
    soloConMovilizacion: params.soloConMovilizacion,
    fase: "EXTERNA",
  });

  const externosFiltrados = externos.filter((g) => !guardiaIdsUsados.has(g.guardiaId));

  if (externosFiltrados.length > 0) {
    const ids = externosFiltrados.map((g) => g.guardiaId);
    ids.forEach((id) => guardiaIdsUsados.add(id));

    const oleada: Oleada = {
      numero: oleadaNumero,
      tipo: "EXTERNO",
      radioMinKm: 0,
      radioMaxKm: params.radioKm,
      esperaMin: config.oleadaExternaEsperaMin,
      guardiaIds: ids,
      guardiaCount: ids.length,
    };
    oleadas.push(oleada);
    previews.push({
      ...oleada,
      guardias: externosFiltrados.map((g) => ({
        id: g.guardiaId,
        nombre: `${g.firstName} ${g.lastName}`,
        distanciaKm: g.distanciaKm,
      })),
    });
  }

  // Renumerar oleadas
  oleadas.forEach((o, i) => (o.numero = i));
  previews.forEach((o, i) => (o.numero = i));

  const totalGuardias = oleadas.reduce((sum, o) => sum + o.guardiaCount, 0);
  const tiempoEstimadoMin = oleadas.reduce((sum, o) => sum + o.esperaMin, 0);

  return {
    oleadas,
    previews,
    totalGuardias,
    tiempoEstimadoMin,
    guardiasConCoordenadas,
    guardiasSinCoordenadas,
  };
}

function agregarOleadaAnillo(
  todosInternos: GuardiaCandidate[],
  guardiaIdsUsados: Set<string>,
  oleadas: Oleada[],
  previews: OleadasPreview[],
  oleadaNumero: number,
  tipo: Oleada["tipo"],
  radioMinKm: number,
  radioMaxKm: number,
  esperaMin: number,
): void {
  const candidatos = todosInternos.filter(
    (g) =>
      g.distanciaKm > radioMinKm &&
      g.distanciaKm <= radioMaxKm &&
      !guardiaIdsUsados.has(g.guardiaId),
  );

  if (candidatos.length === 0) return;

  const ids = candidatos.map((g) => g.guardiaId);
  ids.forEach((id) => guardiaIdsUsados.add(id));

  const oleada: Oleada = {
    numero: oleadaNumero,
    tipo,
    radioMinKm,
    radioMaxKm,
    esperaMin,
    guardiaIds: ids,
    guardiaCount: ids.length,
  };
  oleadas.push(oleada);
  previews.push({
    ...oleada,
    guardias: candidatos.map((g) => ({
      id: g.guardiaId,
      nombre: `${g.firstName} ${g.lastName}`,
      distanciaKm: g.distanciaKm,
    })),
  });
}

async function contarGuardiasSinCoordenadas(tenantId: string): Promise<number> {
  return prisma.opsGuardia.count({
    where: {
      tenantId,
      status: "active",
      lifecycleStatus: { in: ["contratado", "active"] },
      isBlacklisted: false,
      persona: {
        OR: [{ lat: null }, { lng: null }],
      },
    },
  });
}
