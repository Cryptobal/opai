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

export interface OleadasOverride {
  oleada1RadioKm?: number;
  oleada1EsperaMin?: number;
  oleada2RadioKm?: number;
  oleada2EsperaMin?: number;
  oleada3RadioKm?: number;
  oleada3EsperaMin?: number;
  oleadaExternaEsperaMin?: number;
}

export interface GenerarOleadasParams {
  tenantId: string;
  /**
   * Si es null, la alerta es en "modo libre" (dirección manual).
   * Puede generar oleadas internas/externas igual, segmentadas solo por distancia.
   */
  installationId: string | null;
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
  /**
   * Audiencia: a quién notificar.
   * - "internos": solo contratados (planta) — oleadas por anillos de distancia
   * - "externos": solo guardias con `availableExtraShifts = true` — una sola oleada
   * - "ambos" (default): ambos, primero internos por anillos, luego externos
   */
  audiencia?: "internos" | "externos" | "ambos";
  /**
   * Override parcial de la config del tenant para esta alerta específica.
   * Los campos no provistos caen al valor del tenant.
   */
  oleadasOverride?: OleadasOverride | null;
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
  const tenantConfig = await getAlertaCoberturaConfig(params.tenantId);
  // Merge tenant config + override por alerta (si viene). Los campos del override
  // reemplazan a los del tenant, el resto se mantiene.
  const override = params.oleadasOverride ?? {};
  const config = {
    ...tenantConfig,
    oleada1RadioKm: override.oleada1RadioKm ?? tenantConfig.oleada1RadioKm,
    oleada1EsperaMin: override.oleada1EsperaMin ?? tenantConfig.oleada1EsperaMin,
    oleada2RadioKm: override.oleada2RadioKm ?? tenantConfig.oleada2RadioKm,
    oleada2EsperaMin: override.oleada2EsperaMin ?? tenantConfig.oleada2EsperaMin,
    oleada3RadioKm: override.oleada3RadioKm ?? tenantConfig.oleada3RadioKm,
    oleada3EsperaMin: override.oleada3EsperaMin ?? tenantConfig.oleada3EsperaMin,
    oleadaExternaEsperaMin:
      override.oleadaExternaEsperaMin ?? tenantConfig.oleadaExternaEsperaMin,
  };
  const audiencia = params.audiencia ?? "ambos";
  const incluirInternos = audiencia === "internos" || audiencia === "ambos";
  const incluirExternos = audiencia === "externos" || audiencia === "ambos";

  const oleadas: Oleada[] = [];
  const previews: OleadasPreview[] = [];
  const guardiaIdsUsados = new Set<string>();
  let oleadaNumero = 0;

  // Contar guardias sin coordenadas para el reporte
  const guardiasSinCoordenadas = await contarGuardiasSinCoordenadas(params.tenantId);

  // NOTA: Oleada "Turno Saliente" fue removida — un guardia no puede doblar turno (prohibido).
  // Los guardias que están terminando turno en la instalación NO son candidatos.

  // === OLEADAS INTERNAS: por anillos de distancia ===
  //
  // Opción B de clamp: el radio del slider actúa como TOPE DURO sobre los anillos
  // internos. Si el usuario pone 10km y el config tiene anillos 5/15/25, solo se
  // muestran los anillos que caben (cercano 0-5, medio 5-10 recortado). Esto hace
  // que el preview respete exactamente lo que el usuario pidió.
  //
  // En modo libre (installationId === null) NO hay oleadas internas — no hay
  // "empleados internos de esta instalación" porque no hay instalación.

  let todosInternos: import("./segmentacion.service").GuardiaCandidate[] = [];
  let guardiasConCoordenadas = 0;

  // Oleadas internas: los "contratados" (fase INTERNA).
  // ANTES: solo corría cuando había installationId.
  // AHORA: corre siempre que la audiencia incluya internos — installationId es
  // opcional porque la segmentación internamente solo lo usa para excluir
  // guardias ocupados por horario (ese filtro funciona con null).
  if (incluirInternos) {
    const radioMaxInterno = Math.min(params.radioKm, config.oleada3RadioKm);
    todosInternos = await resolverCandidatos({
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

    guardiasConCoordenadas = todosInternos.length;

    // Anillo 1: Cercanos (0 - min(oleada1RadioKm, radioKm))
    const anillo1Max = Math.min(config.oleada1RadioKm, params.radioKm);
    if (anillo1Max > 0) {
      agregarOleadaAnillo(
        todosInternos,
        guardiaIdsUsados,
        oleadas,
        previews,
        oleadaNumero,
        "INTERNO_CERCANO",
        0,
        anillo1Max,
        config.oleada1EsperaMin,
      );
      if (oleadas.length > oleadaNumero) oleadaNumero++;
    }

    // Anillo 2: Medianos (oleada1RadioKm - min(oleada2RadioKm, radioKm))
    if (params.radioKm > config.oleada1RadioKm) {
      const anillo2Max = Math.min(config.oleada2RadioKm, params.radioKm);
      const preCountMedio = oleadas.length;
      agregarOleadaAnillo(
        todosInternos,
        guardiaIdsUsados,
        oleadas,
        previews,
        oleadaNumero,
        "INTERNO_MEDIO",
        config.oleada1RadioKm,
        anillo2Max,
        config.oleada2EsperaMin,
      );
      if (oleadas.length > preCountMedio) oleadaNumero++;
    }

    // Anillo 3: Lejanos (oleada2RadioKm - min(oleada3RadioKm, radioKm))
    if (params.radioKm > config.oleada2RadioKm) {
      const anillo3Max = Math.min(config.oleada3RadioKm, params.radioKm);
      const preCountLejano = oleadas.length;
      agregarOleadaAnillo(
        todosInternos,
        guardiaIdsUsados,
        oleadas,
        previews,
        oleadaNumero,
        "INTERNO_LEJANO",
        config.oleada2RadioKm,
        anillo3Max,
        config.oleada3EsperaMin,
      );
      if (oleadas.length > preCountLejano) oleadaNumero++;
    }
  }

  // === OLEADA EXTERNA ===
  const externos = incluirExternos ? await resolverCandidatos({
    tenantId: params.tenantId,
    installationId: params.installationId, // puede ser null en modo libre
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
  }) : [];

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
      g.distanciaKm >= radioMinKm &&
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
