/**
 * Servicio compartido de control de asistencia (fuente única de verdad),
 * usado por WEB y SLACK por igual (paridad total). Funciones puras de dominio
 * sobre `OpsAsistenciaDiaria` + historial en `OpsContactoCentral`.
 *
 * Toda query filtra por `tenantId` (multi-tenant estricto). Cada función guarda
 * el estado que corresponde y rechaza los que no.
 */

import { Prisma } from "@prisma/client";
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
  /**
   * Resultado del contacto de central con el entrante. Opcional: el botón
   * "En camino" ya deja la fila en `en_camino`; el resultado solo agrega la
   * bitácora en `OpsContactoCentral` si el operador efectivamente contactó.
   */
  resultado?: ContactoResultado | null;
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
 * Marca al entrante como "en camino". El estado se setea siempre; el resultado
 * del contacto de central es opcional y, si está presente, agrega una fila al
 * historial (`OpsContactoCentral`). Sin resultado no se crea bitácora.
 */
export async function marcarEnCamino(
  params: MarcarEnCaminoParams,
): Promise<AsistenciaControlResult> {
  const asistencia = await loadAsistencia(params.tenantId, params.asistenciaId);
  if (!asistencia) return { ok: false, error: "No se encontró la asistencia." };
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) return { ok: false, error: `Estado no intervenible: "${asistencia.attendanceStatus}".` };

  const resultado = params.resultado ?? null;
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.opsAsistenciaDiaria.update({
      where: { id: asistencia.id },
      data: {
        attendanceStatus: "en_camino",
        contactoCentralAt: now,
        contactoCentralBy: params.operadorName ?? params.operadorId ?? null,
        contactoCentralResultado: resultado,
      },
    }),
  ];
  // La bitácora de contacto solo se registra si hubo contacto efectivo.
  if (resultado) {
    ops.push(
      prisma.opsContactoCentral.create({
        data: {
          tenantId: params.tenantId,
          asistenciaId: asistencia.id,
          resultado,
          minutosAtraso: params.minutosAtraso ?? null,
          comentario: params.comentario ?? null,
          operadorId: params.operadorId ?? null,
          operadorName: params.operadorName ?? null,
          origen: params.origen ?? "slack",
        },
      }),
    );
  }
  await prisma.$transaction(ops);

  await logAudit({
    action: "UPDATE",
    entity: "OpsAsistenciaDiaria",
    entityId: asistencia.id,
    tenantId: params.tenantId,
    userId: params.operadorId ?? null,
    details: { via: params.origen ?? "slack", op: "en_camino", resultado, minutosAtraso: params.minutosAtraso ?? null },
  }).catch(() => {});

  return { ok: true, attendanceStatus: "en_camino", installationId: asistencia.installationId, date: asistencia.date };
}

/** Central confirma que el entrante llegó (sin marca electrónica). */
export async function confirmarLlegada(params: BaseParams): Promise<AsistenciaControlResult> {
  const asistencia = await loadAsistencia(params.tenantId, params.asistenciaId);
  if (!asistencia) return { ok: false, error: "No se encontró la asistencia." };
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) return { ok: false, error: `Estado no intervenible: "${asistencia.attendanceStatus}".` };

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
  if (!OPEN_STATES.has(asistencia.attendanceStatus)) return { ok: false, error: `Estado no intervenible: "${asistencia.attendanceStatus}".` };

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
