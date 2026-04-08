/**
 * Motor de Segmentación Geográfica — Alertas de Cobertura
 *
 * Resuelve: "Dada una alerta con sus filtros, ¿qué guardias califican?"
 *
 * === HALLAZGOS DEL SCHEMA ===
 * - Género:     OpsPersona.sex (String?) — valores esperados: "M" | "F" | null
 * - OS10:       OpsGuardia.os10 (Boolean?) + OpsGuardia.os10ExpiresAt (DateTime?)
 * - Modalidad:  NO EXISTE campo en OpsGuardia/OpsPersona — solo en OpsAlertaCobertura.
 *               TODO: Agregar campo modalidades/specialties a OpsGuardia cuando se defina el modelo.
 *               Por ahora el filtro de modalidad es NO-OP.
 * - Dealer:     NO EXISTE campo esDealer/tipoPersonal. contractType es "plazo_fijo" | "indefinido".
 *               Se usa availableExtraShifts como proxy para fase EXTERNA.
 * - Coordenadas: OpsPersona.lat (Decimal 10,7) + OpsPersona.lng (Decimal 10,7)
 * - Movilización: OpsPersona.hasMobilization (Boolean?)
 * - Turnos Extra: OpsGuardia.availableExtraShifts (Boolean)
 * - Lifecycle:  OpsGuardia.lifecycleStatus + OpsGuardia.status
 */

import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";

export interface GuardiaCandidate {
  guardiaId: string;
  personaId: string;
  firstName: string;
  lastName: string;
  lat: number;
  lng: number;
  distanciaKm: number;
  esInterno: boolean;
  hasMobilization: boolean;
  availableExtraShifts: boolean;
  phone: string | null;
  email: string | null;
  genero: string | null;
  os10Vigente: boolean;
  // TODO: modalidades cuando exista el campo en schema
}

export interface FiltrosSegmentacion {
  tenantId: string;
  installationId: string | null;
  instalacionLat: number;
  instalacionLng: number;
  radioKm: number;
  fechaInicio: Date;
  fechaFin: Date;
  genero?: string | null;
  modalidad: string; // "GGSS" | "CCTV" | "TACTICO" — NO-OP por ahora
  requiereOS10: boolean;
  soloDealer: boolean;
  soloConMovilizacion: boolean;
  fase: "INTERNA" | "EXTERNA";
}

/**
 * Resuelve candidatos que califican para una alerta según filtros de segmentación.
 * Retorna ordenados por distancia ASC (más cercanos primero).
 */
export async function resolverCandidatos(
  filtros: FiltrosSegmentacion,
): Promise<GuardiaCandidate[]> {
  const ahora = new Date();

  // 1. Query base: guardias activos del tenant con coordenadas
  const guardias = await prisma.opsGuardia.findMany({
    where: {
      tenantId: filtros.tenantId,
      status: "active",
      lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
      isBlacklisted: false,
      persona: {
        lat: { not: null },
        lng: { not: null },
      },
    },
    select: {
      id: true,
      personaId: true,
      availableExtraShifts: true,
      os10: true,
      os10ExpiresAt: true,
      contractType: true,
      persona: {
        select: {
          firstName: true,
          lastName: true,
          lat: true,
          lng: true,
          phone: true,
          email: true,
          sex: true,
          hasMobilization: true,
        },
      },
    },
  });

  // 2. Obtener IDs de guardias con turno planificado en el rango de la alerta
  const fechaDate = filtros.fechaInicio;
  const guardiasOcupados = await obtenerGuardiasOcupados(
    filtros.tenantId,
    filtros.installationId ?? "",
    fechaDate,
    filtros.fechaInicio,
    filtros.fechaFin,
  );

  const candidatos: GuardiaCandidate[] = [];

  for (const g of guardias) {
    const p = g.persona;
    if (!p.lat || !p.lng) continue;

    const lat = Number(p.lat);
    const lng = Number(p.lng);

    // Fase INTERNA: empleados internos que NO están en turno
    if (filtros.fase === "INTERNA") {
      // Excluir guardias que están ocupados en el horario de la alerta
      if (guardiasOcupados.has(g.id)) continue;
    }

    // Fase EXTERNA: guardias con disponibilidad para turnos extra
    if (filtros.fase === "EXTERNA") {
      if (!g.availableExtraShifts) continue;
    }

    // Filtro género
    if (filtros.genero) {
      if (p.sex !== filtros.genero) continue;
    }

    // Filtro OS10 vigente
    if (filtros.requiereOS10) {
      const os10Vigente = g.os10 === true && (!g.os10ExpiresAt || g.os10ExpiresAt > ahora);
      if (!os10Vigente) continue;
    }

    // Filtro modalidad — NO-OP: campo no existe en schema
    // TODO: Filtrar por modalidad cuando se agregue OpsGuardia.modalidades
    if (filtros.modalidad) {
      console.warn(
        "[AlertaCobertura] Filtro de modalidad omitido: campo no existe en schema OpsGuardia",
      );
    }

    // Filtro movilización
    if (filtros.soloConMovilizacion) {
      if (!p.hasMobilization) continue;
    }

    // Filtro dealer — NO-OP: no hay campo esDealer
    // soloDealer se maneja a nivel de oleadas, no aquí
    if (filtros.soloDealer) {
      console.warn(
        "[AlertaCobertura] Filtro dealer omitido: campo esDealer no existe en schema OpsGuardia",
      );
    }

    // Calcular distancia
    const distM = haversineDistance(filtros.instalacionLat, filtros.instalacionLng, lat, lng);
    const distanciaKm = distM / 1000;

    // Filtrar por radio
    if (distanciaKm > filtros.radioKm) continue;

    const os10Vigente = g.os10 === true && (!g.os10ExpiresAt || g.os10ExpiresAt > ahora);

    candidatos.push({
      guardiaId: g.id,
      personaId: g.personaId,
      firstName: p.firstName,
      lastName: p.lastName,
      lat,
      lng,
      distanciaKm: Math.round(distanciaKm * 100) / 100,
      esInterno: filtros.fase === "INTERNA",
      hasMobilization: p.hasMobilization ?? false,
      availableExtraShifts: g.availableExtraShifts,
      phone: p.phone,
      email: p.email,
      genero: p.sex,
      os10Vigente,
    });
  }

  // Ordenar por distancia ASC
  candidatos.sort((a, b) => a.distanciaKm - b.distanciaKm);

  return candidatos;
}

/**
 * Resuelve guardias del turno saliente de una instalación.
 * Son los guardias que tienen turno HOY en esta instalación cuyo turno termina
 * dentro de las próximas 2 horas desde fechaInicio.
 */
export async function resolverTurnoSaliente(
  tenantId: string,
  installationId: string,
  fechaInicio: Date,
): Promise<GuardiaCandidate[]> {
  const fechaDate = new Date(fechaInicio.toISOString().split("T")[0]);

  // Buscar pauta mensual para hoy en esta instalación con turno de trabajo
  const pautaHoy = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      installationId,
      date: fechaDate,
      shiftCode: "T",
      plannedGuardiaId: { not: null },
    },
    select: {
      plannedGuardiaId: true,
      replacementGuardiaId: true,
      puestoId: true,
      slotNumber: true,
      puesto: {
        select: { shiftEnd: true },
      },
    },
  });

  if (pautaHoy.length === 0) return [];

  // Filtrar los que terminan turno dentro de 2 horas desde fechaInicio
  const dosHorasAntes = new Date(fechaInicio.getTime() - 2 * 60 * 60 * 1000);
  const guardiaIds: string[] = [];

  for (const entrada of pautaHoy) {
    const shiftEnd = entrada.puesto?.shiftEnd;
    if (!shiftEnd) {
      // Sin hora de fin definida, incluir por si acaso
      const gId = entrada.replacementGuardiaId || entrada.plannedGuardiaId;
      if (gId) guardiaIds.push(gId);
      continue;
    }

    // Parsear shiftEnd (formato "HH:mm") y comparar con fechaInicio
    const [h, m] = shiftEnd.split(":").map(Number);
    const finTurno = new Date(fechaDate);
    finTurno.setHours(h, m, 0, 0);

    // Turno saliente: termina entre (fechaInicio - 2h) y fechaInicio
    if (finTurno >= dosHorasAntes && finTurno <= fechaInicio) {
      const gId = entrada.replacementGuardiaId || entrada.plannedGuardiaId;
      if (gId) guardiaIds.push(gId);
    }
  }

  if (guardiaIds.length === 0) return [];

  // Cargar datos completos de estos guardias
  const guardias = await prisma.opsGuardia.findMany({
    where: {
      id: { in: [...new Set(guardiaIds)] },
      tenantId,
      status: "active",
      isBlacklisted: false,
    },
    select: {
      id: true,
      personaId: true,
      availableExtraShifts: true,
      os10: true,
      os10ExpiresAt: true,
      persona: {
        select: {
          firstName: true,
          lastName: true,
          lat: true,
          lng: true,
          phone: true,
          email: true,
          sex: true,
          hasMobilization: true,
        },
      },
    },
  });

  const ahora = new Date();

  return guardias.map((g) => ({
    guardiaId: g.id,
    personaId: g.personaId,
    firstName: g.persona.firstName,
    lastName: g.persona.lastName,
    lat: g.persona.lat ? Number(g.persona.lat) : 0,
    lng: g.persona.lng ? Number(g.persona.lng) : 0,
    distanciaKm: 0, // Ya están en la instalación
    esInterno: true,
    hasMobilization: g.persona.hasMobilization ?? false,
    availableExtraShifts: g.availableExtraShifts,
    phone: g.persona.phone,
    email: g.persona.email,
    genero: g.persona.sex,
    os10Vigente: g.os10 === true && (!g.os10ExpiresAt || g.os10ExpiresAt > ahora),
  }));
}

/**
 * Obtiene IDs de guardias que están ocupados (tienen turno de trabajo) en el rango dado.
 * Un guardia está "ocupado" si tiene shiftCode = 'T' en la fecha y su turno se solapa
 * con el rango fechaInicio-fechaFin.
 */
async function obtenerGuardiasOcupados(
  tenantId: string,
  _installationId: string,
  fechaDate: Date,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<Set<string>> {
  const date = new Date(fechaDate.toISOString().split("T")[0]);

  // Buscar todas las entradas de pauta con turno de trabajo para la fecha
  const entradas = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      date,
      shiftCode: "T",
    },
    select: {
      plannedGuardiaId: true,
      replacementGuardiaId: true,
      puesto: {
        select: { shiftStart: true, shiftEnd: true },
      },
    },
  });

  const ocupados = new Set<string>();

  for (const e of entradas) {
    const guardiaId = e.replacementGuardiaId || e.plannedGuardiaId;
    if (!guardiaId) continue;

    // Si no hay horarios definidos en el puesto, asumir ocupado todo el día
    if (!e.puesto?.shiftStart || !e.puesto?.shiftEnd) {
      ocupados.add(guardiaId);
      continue;
    }

    // Parsear horarios del puesto
    const [sh, sm] = e.puesto.shiftStart.split(":").map(Number);
    const [eh, em] = e.puesto.shiftEnd.split(":").map(Number);

    const turnoInicio = new Date(date);
    turnoInicio.setHours(sh, sm, 0, 0);
    const turnoFin = new Date(date);
    turnoFin.setHours(eh, em, 0, 0);

    // Turno nocturno: si fin < inicio, el turno cruza medianoche
    if (turnoFin <= turnoInicio) {
      turnoFin.setDate(turnoFin.getDate() + 1);
    }

    // Verificar solapamiento con el rango de la alerta
    if (turnoInicio < fechaFin && turnoFin > fechaInicio) {
      ocupados.add(guardiaId);
    }
  }

  return ocupados;
}
