/**
 * Servicio compartido de control de asistencia (fuente única de verdad),
 * usado por WEB y SLACK por igual (paridad total). Funciones puras de dominio
 * sobre `OpsAsistenciaDiaria` + historial en `OpsContactoCentral`.
 *
 * Toda query filtra por `tenantId` (multi-tenant estricto). Cada función guarda
 * el estado que corresponde y rechaza los que no.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export type ContactoResultado = "no_contesta" | "confirmado" | "atrasado";
export type ControlOrigen = "slack" | "web";

interface BaseParams {
  tenantId: string;
  asistenciaId: string;
  operadorId?: string | null;
  operadorName?: string | null;
}

export interface MarcarEnCaminoParams extends BaseParams {
  resultado: ContactoResultado;
  minutosAtraso?: number | null;
  comentario?: string | null;
  origen?: ControlOrigen;
}

export interface AsistenciaControlResult {
  ok: boolean;
  error?: string;
  attendanceStatus?: string;
  installationId?: string;
  date?: Date;
  /** True cuando la ausencia deja un puesto sin cubrir (abrir flujo de reemplazo). */
  needsCobertura?: boolean;
}

/** Estados desde los que central puede intervenir sobre el entrante. */
const OPEN_STATES = new Set(["pendiente", "en_camino", "ppc"]);

async function loadAsistencia(tenantId: string, asistenciaId: string) {
  return prisma.opsAsistenciaDiaria.findFirst({
    where: { id: asistenciaId, tenantId },
    select: { id: true, attendanceStatus: true, installationId: true, date: true },
  });
}

/**
 * Registra un llamado de central al entrante. Cualquier resultado deja la fila
 * en `en_camino` (la llegada se confirma aparte) y agrega una fila al historial.
 */
export async function marcarEnCamino(
  params: MarcarEnCaminoParams,
): Promise<AsistenciaControlResult> {
  const asistencia = await loadAsistencia(params.tenantId, params.asistenciaId);
  if (!asistencia) return { ok: false, error: "No se encontró la asistencia." };
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) {
    return { ok: false, error: `El guardia ya está en estado "${asistencia.attendanceStatus}".` };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.opsAsistenciaDiaria.update({
      where: { id: asistencia.id },
      data: {
        attendanceStatus: "en_camino",
        contactoCentralAt: now,
        contactoCentralBy: params.operadorName ?? params.operadorId ?? null,
        contactoCentralResultado: params.resultado,
      },
    }),
    prisma.opsContactoCentral.create({
      data: {
        tenantId: params.tenantId,
        asistenciaId: asistencia.id,
        resultado: params.resultado,
        minutosAtraso: params.minutosAtraso ?? null,
        comentario: params.comentario ?? null,
        operadorId: params.operadorId ?? null,
        operadorName: params.operadorName ?? null,
        origen: params.origen ?? "slack",
      },
    }),
  ]);

  await logAudit({
    action: "UPDATE",
    entity: "OpsAsistenciaDiaria",
    entityId: asistencia.id,
    tenantId: params.tenantId,
    userId: params.operadorId ?? null,
    details: { via: params.origen ?? "slack", op: "en_camino", resultado: params.resultado, minutosAtraso: params.minutosAtraso ?? null },
  }).catch(() => {});

  return { ok: true, attendanceStatus: "en_camino", installationId: asistencia.installationId, date: asistencia.date };
}

/** Central confirma que el entrante llegó (sin marca electrónica). */
export async function confirmarLlegada(params: BaseParams): Promise<AsistenciaControlResult> {
  const asistencia = await loadAsistencia(params.tenantId, params.asistenciaId);
  if (!asistencia) return { ok: false, error: "No se encontró la asistencia." };
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) {
    return { ok: false, error: `El guardia ya está en estado "${asistencia.attendanceStatus}".` };
  }

  await prisma.opsAsistenciaDiaria.update({
    where: { id: asistencia.id },
    data: {
      attendanceStatus: "confirmado_llegada",
      contactoCentralAt: new Date(),
      contactoCentralBy: params.operadorName ?? params.operadorId ?? null,
    },
  });

  await logAudit({
    action: "UPDATE",
    entity: "OpsAsistenciaDiaria",
    entityId: asistencia.id,
    tenantId: params.tenantId,
    userId: params.operadorId ?? null,
    details: { via: "central", op: "confirmar_llegada" },
  }).catch(() => {});

  return { ok: true, attendanceStatus: "confirmado_llegada", installationId: asistencia.installationId, date: asistencia.date };
}

/** Central reporta ausencia. Marca `no_asistio` y señala que falta cobertura. */
export async function reportarAusencia(
  params: BaseParams & { motivo?: string | null },
): Promise<AsistenciaControlResult> {
  const asistencia = await loadAsistencia(params.tenantId, params.asistenciaId);
  if (!asistencia) return { ok: false, error: "No se encontró la asistencia." };
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) {
    return { ok: false, error: `El guardia ya está en estado "${asistencia.attendanceStatus}".` };
  }

  await prisma.opsAsistenciaDiaria.update({
    where: { id: asistencia.id },
    data: { attendanceStatus: "no_asistio", contactoCentralAt: new Date(), contactoCentralBy: params.operadorName ?? params.operadorId ?? null },
  });

  await logAudit({
    action: "UPDATE",
    entity: "OpsAsistenciaDiaria",
    entityId: asistencia.id,
    tenantId: params.tenantId,
    userId: params.operadorId ?? null,
    details: { via: "central", op: "reportar_ausencia", motivo: params.motivo ?? null },
  }).catch(() => {});

  return { ok: true, attendanceStatus: "no_asistio", needsCobertura: true, installationId: asistencia.installationId, date: asistencia.date };
}
