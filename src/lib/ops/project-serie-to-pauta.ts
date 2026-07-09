/**
 * Proyección de la serie activa sobre la pauta mensual, acotada a UN día.
 *
 * ⚠️ Espejo EXACTO de la proyección de la vista mensual
 * (`src/app/api/ops/pauta-mensual/route.ts`, bloque "Auto-project active series
 * to unpainted cells"), pero limitada a un solo `date` en vez de todo el mes.
 * Ambas lógicas DEBEN mantenerse en sync: la web proyecta on-demand al abrir la
 * vista; el cron del tablero de relevo la invoca antes de materializar la
 * asistencia, para que `OpsAsistenciaDiaria` exista aunque nadie haya abierto
 * la vista ese mes (fuente de verdad única entre web y cron).
 *
 * Idempotente: `createMany` con `skipDuplicates` para filas base faltantes +
 * `updateMany` acotado a `shiftCode: null` para no sobrescribir celdas ya
 * pintadas (manual o previo). NO borra filas. Multi-tenant estricto: toda query
 * filtra por `tenantId`.
 */

import { prisma } from "@/lib/prisma";
import { generateSerieForMonth } from "@/lib/ops";
import { installationFilterFor } from "./ensure-asistencia-dia-helpers";

export async function projectActiveSeriesToPauta(params: {
  tenantId: string;
  installationId?: string; // undefined | "all" => todas las instalaciones del tenant
  date: Date; // día exacto (medianoche UTC del día calendario), no "hoy" genérico
}): Promise<void> {
  const { tenantId, date } = params;

  // Puestos activos (respeta rango activeFrom/activeUntil para este día, igual
  // que la UI). Si el puesto no cubre la fecha, no genera fila base ni proyección.
  const activePuestos = await prisma.opsPuestoOperativo.findMany({
    where: { tenantId, ...installationFilterFor(params.installationId), active: true },
    select: { id: true, installationId: true, requiredGuards: true, activeFrom: true, activeUntil: true },
  });
  const puestos = activePuestos.filter((p) => {
    if (p.activeFrom && date < p.activeFrom) return false;
    if (p.activeUntil && date >= p.activeUntil) return false;
    return true;
  });
  if (puestos.length === 0) return;

  const puestoIds = puestos.map((p) => p.id);

  // Crear filas base faltantes (shiftCode=null) por (puesto, slot) para este día.
  // Sin fila base, el updateMany de proyección no persiste (updateMany no crea).
  const existing = await prisma.opsPautaMensual.findMany({
    where: { tenantId, puestoId: { in: puestoIds }, date },
    select: { puestoId: true, slotNumber: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.puestoId}|${e.slotNumber}`));
  const missingRows: {
    tenantId: string;
    installationId: string;
    puestoId: string;
    slotNumber: number;
    date: Date;
    plannedGuardiaId: string | null;
    shiftCode: string | null;
    status: string;
    createdBy: string | null;
  }[] = [];
  for (const puesto of puestos) {
    for (let slot = 1; slot <= puesto.requiredGuards; slot++) {
      if (existingKeys.has(`${puesto.id}|${slot}`)) continue;
      missingRows.push({
        tenantId,
        installationId: puesto.installationId,
        puestoId: puesto.id,
        slotNumber: slot,
        date,
        plannedGuardiaId: null,
        shiftCode: null,
        status: "planificado",
        createdBy: null,
      });
    }
  }
  if (missingRows.length > 0) {
    await prisma.opsPautaMensual.createMany({ data: missingRows, skipDuplicates: true });
  }

  // Series activas + asignaciones activas (saltando guardias inactivos), idéntico a la UI.
  const activeSeries = await prisma.opsSerieAsignacion.findMany({
    where: { tenantId, puestoId: { in: puestoIds }, isActive: true },
    select: {
      puestoId: true,
      slotNumber: true,
      guardiaId: true,
      patternWork: true,
      patternOff: true,
      startDate: true,
      startPosition: true,
    },
  });
  if (activeSeries.length === 0) return;

  const activeAsignaciones = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, puestoId: { in: puestoIds }, isActive: true },
    select: {
      puestoId: true,
      slotNumber: true,
      guardiaId: true,
      startDate: true,
      guardia: { select: { lifecycleStatus: true } },
    },
  });
  const asignacionMap = new Map<string, { guardiaId: string; startDate: Date }>();
  for (const a of activeAsignaciones) {
    if (a.guardia?.lifecycleStatus === "inactivo") continue;
    asignacionMap.set(`${a.puestoId}|${a.slotNumber}`, { guardiaId: a.guardiaId, startDate: a.startDate });
  }

  // Proyectar cada serie sobre la celda del día, sólo si sigue en shiftCode=null.
  const updates: Promise<unknown>[] = [];
  for (const serie of activeSeries) {
    const entries = generateSerieForMonth(
      serie.startDate,
      serie.startPosition,
      serie.patternWork,
      serie.patternOff,
      [date],
    );
    const asig = asignacionMap.get(`${serie.puestoId}|${serie.slotNumber}`);
    for (const entry of entries) {
      let plannedGuardiaId: string | null = null;
      if (entry.shiftCode === "T" && asig && entry.date >= asig.startDate) {
        plannedGuardiaId = asig.guardiaId;
      }
      updates.push(
        prisma.opsPautaMensual.updateMany({
          where: {
            tenantId,
            puestoId: serie.puestoId,
            slotNumber: serie.slotNumber,
            date: entry.date,
            shiftCode: null, // sólo celdas sin pintar: nunca sobrescribe manual/previo
          },
          data: { shiftCode: entry.shiftCode, plannedGuardiaId },
        }),
      );
    }
  }
  if (updates.length > 0) await Promise.all(updates);
}
