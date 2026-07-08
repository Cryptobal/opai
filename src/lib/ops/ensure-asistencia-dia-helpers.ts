/**
 * Helpers compartidos para materializar `OpsAsistenciaDiaria` desde la pauta.
 *
 * Extraídos de `src/app/api/ops/asistencia/route.ts` (GET) para reutilizarlos
 * tanto en la vista web como en el cron del tablero de relevo. La lógica es
 * idéntica a la original: consulta de pauta filtrada por `shiftCode` y overlay
 * de ausencias aprobadas como fuente de verdad del código de turno efectivo.
 */

import { prisma } from "@/lib/prisma";
import { EVENT_SUBTYPES } from "@/lib/guard-events";

/** Códigos de ausencia que generan fila de asistencia (PPC si no hay reemplazo). */
export const ABSENCE_CODES = ["V", "L", "PCG", "PSG"];

/** Fila de pauta con los campos que necesita la materialización de asistencia. */
export type PautaItem = {
  puestoId: string;
  slotNumber: number;
  plannedGuardiaId: string | null;
  replacementGuardiaId: string | null;
  installationId: string;
  shiftCode: string | null;
  puesto: { shiftStart: string; shiftEnd: string };
};

/** Filtro de instalación: `undefined`/`"all"` => todas las del tenant. */
export function installationFilterFor(installationId?: string): { installationId?: string } {
  return installationId && installationId !== "all" ? { installationId } : {};
}

/**
 * Carga la pauta del día para (tenant, instalación) con los días que generan
 * fila de asistencia: trabajo ("T") + ausencias (V/L/PCG/PSG). Días libres y
 * sin serie no aparecen.
 */
export async function loadPautaForDate(params: {
  tenantId: string;
  installationId?: string;
  date: Date;
}): Promise<PautaItem[]> {
  return prisma.opsPautaMensual.findMany({
    where: {
      tenantId: params.tenantId,
      ...installationFilterFor(params.installationId),
      date: params.date,
      puesto: { active: true },
      shiftCode: { in: ["T", ...ABSENCE_CODES] },
    },
    select: {
      puestoId: true,
      slotNumber: true,
      plannedGuardiaId: true,
      replacementGuardiaId: true,
      installationId: true,
      shiftCode: true,
      puesto: {
        select: {
          shiftStart: true,
          shiftEnd: true,
        },
      },
    },
  });
}

/**
 * Resolutor del código de turno efectivo: superpone las ausencias aprobadas
 * (fuente de verdad) sobre la celda planificada de la pauta.
 *
 * La pauta mensual puede NO haberse repintado (V/L/PCG/PSG) si el evento se
 * aprobó antes de generar la pauta del mes o si la serie se regeneró luego. En
 * vez de depender solo del shiftCode pintado, consultamos los eventos de
 * ausencia aprobados que cubren la fecha y los superponemos: así un guardia con
 * permiso/licencia ese día siempre genera PPC aunque su celda haya quedado "T".
 */
export async function buildEffectiveShiftCode(
  params: { tenantId: string; date: Date },
  pauta: PautaItem[],
): Promise<(item: { plannedGuardiaId: string | null; shiftCode: string | null }) => string | null> {
  const plannedGuardiaIds = [
    ...new Set(
      pauta
        .map((p) => p.plannedGuardiaId)
        .filter((id): id is string => id != null)
    ),
  ];
  const approvedAbsences =
    plannedGuardiaIds.length > 0
      ? await prisma.opsGuardEvent.findMany({
        where: {
          tenantId: params.tenantId,
          guardiaId: { in: plannedGuardiaIds },
          category: "ausencia",
          status: "approved",
          startDate: { lte: params.date },
          endDate: { gte: params.date },
        },
        select: { guardiaId: true, subtype: true },
      })
      : [];
  const subtypeToShiftCode = new Map(
    EVENT_SUBTYPES.ausencia
      .filter((s) => s.shiftCode)
      .map((s) => [s.value as string, s.shiftCode as string])
  );
  const absenceCodeByGuardia = new Map<string, string>();
  for (const a of approvedAbsences) {
    const code = subtypeToShiftCode.get(a.subtype);
    if (code) absenceCodeByGuardia.set(a.guardiaId, code);
  }
  return (item: { plannedGuardiaId: string | null; shiftCode: string | null }): string | null => {
    if (item.plannedGuardiaId) {
      const overlay = absenceCodeByGuardia.get(item.plannedGuardiaId);
      if (overlay) return overlay;
    }
    return item.shiftCode;
  };
}
