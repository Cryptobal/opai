/**
 * Materialización de `OpsAsistenciaDiaria` desde la pauta mensual para un día.
 *
 * Extraído tal cual del GET de `src/app/api/ops/asistencia/route.ts` para que la
 * vista web y el cron del tablero de relevo compartan la MISMA generación: la
 * vista lo llamaba on-demand al abrir asistencia; el cron ahora lo llama antes
 * de publicar el tablero, de modo que `OpsAsistenciaDiaria` exista aunque nadie
 * haya abierto la vista ese día.
 *
 * Es idempotente (`createMany` con `skipDuplicates` + `updateMany` de
 * sincronización), así que puede llamarse en cada corrida sin efectos adversos.
 * Sólo materializa: NO lee ni responde.
 */

import { prisma } from "@/lib/prisma";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { projectActiveSeriesToPauta } from "./project-serie-to-pauta";
import {
  ABSENCE_CODES,
  buildEffectiveShiftCode,
  installationFilterFor,
  loadPautaForDate,
} from "./ensure-asistencia-dia-helpers";

export async function ensureAsistenciaDia(params: {
  tenantId: string;
  installationId?: string; // undefined | "all" => todas las instalaciones del tenant
  date: Date; // fecha del turno (día exacto), no "hoy" genérico
  createdBy?: string | null; // opcional; el cron no tiene userId
}): Promise<void> {
  const { tenantId, date } = params;
  const installationFilter = installationFilterFor(params.installationId);
  const createdBy = params.createdBy ?? null;

  // Proyecta la serie activa sobre celdas sin pintar ANTES de leer la pauta, para
  // que la fuente de verdad sea única entre web y cron: si nadie abrió la vista
  // mensual, las celdas siguen en shiftCode=null y loadPautaForDate no las vería.
  // Idempotente (createMany skipDuplicates + updateMany sobre shiftCode=null).
  await projectActiveSeriesToPauta({ tenantId, installationId: params.installationId, date });

  // Auto-create asistencia rows from pauta mensual
  // Días con shiftCode="T" (trabajo) + ausencias (V/L/PCG/PSG) generan filas.
  // Días libres ("-") y sin serie no generan filas en asistencia.
  const pauta = await loadPautaForDate({ tenantId, installationId: params.installationId, date });

  // Overlay de ausencias aprobadas como fuente de verdad.
  const effectiveShiftCode = await buildEffectiveShiftCode({ tenantId, date }, pauta);

  // Limpiar asistencias huérfanas de puestos inactivos (no bloqueadas, sin reemplazo/TE)
  // Nunca borrar filas con replacementGuardiaId: tienen TE asignado y deben persistir
  const orphanedRows = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      ...installationFilter,
      date,
      puesto: { active: false },
      lockedAt: null,
      replacementGuardiaId: null,
    },
    select: { id: true },
  });
  if (orphanedRows.length > 0) {
    const orphanIds = orphanedRows.map((r) => r.id);
    await prisma.opsTurnoExtra.deleteMany({
      where: { asistenciaId: { in: orphanIds }, status: "pending" },
    });
    await prisma.opsAsistenciaDiaria.deleteMany({
      where: { id: { in: orphanIds } },
    });
  }

  // Limpiar filas de asistencia para días sin serie pintada (shiftCode != "T")
  // Esto elimina "fantasmas" de filas creadas antes del filtro por shiftCode.
  // Solo limpia filas no bloqueadas, sin reemplazo y sin TE aprobado/pagado.
  const pautaKeys = new Set(
    pauta.map((p) => `${p.puestoId}|${p.slotNumber}`)
  );
  const allAsistenciaForDate = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      ...installationFilter,
      date,
      lockedAt: null,
      replacementGuardiaId: null,
      attendanceStatus: { in: ["pendiente", "ppc"] },
    },
    select: { id: true, puestoId: true, slotNumber: true },
  });
  const candidateGhostIds = allAsistenciaForDate
    .filter((row) => !pautaKeys.has(`${row.puestoId}|${row.slotNumber}`))
    .map((row) => row.id);
  // No borrar filas que tengan TE vinculado (pending/approved/paid): el TE debe persistir
  const withLinkedTe =
    candidateGhostIds.length > 0
      ? await prisma.opsTurnoExtra.findMany({
        where: {
          asistenciaId: { in: candidateGhostIds },
          status: { in: ["pending", "approved", "paid"] },
        },
        select: { asistenciaId: true },
      })
      : [];
  const protectedIds = new Set(withLinkedTe.map((t) => t.asistenciaId).filter(Boolean));
  const ghostIds = candidateGhostIds.filter((id) => !protectedIds.has(id));
  if (ghostIds.length > 0) {
    await prisma.opsTurnoExtra.deleteMany({
      where: { asistenciaId: { in: ghostIds }, status: "pending" },
    });
    await prisma.opsAsistenciaDiaria.deleteMany({
      where: { id: { in: ghostIds } },
    });
  }

  if (pauta.length > 0) {
    await prisma.opsAsistenciaDiaria.createMany({
      data: pauta.map((item) => {
        const isAbsence = ABSENCE_CODES.includes(effectiveShiftCode(item) ?? "");
        // For absences with replacement, the replacement becomes the effective planned guardia.
        // For absences without replacement, keep original guard so their name shows, but status = ppc.
        const effectiveGuardiaId = isAbsence
          ? (item.replacementGuardiaId ?? item.plannedGuardiaId)
          : (item.replacementGuardiaId ?? item.plannedGuardiaId);
        const status = isAbsence && !item.replacementGuardiaId
          ? "ppc"
          : effectiveGuardiaId ? "pendiente" : "ppc";
        const metrics = computeAttendanceMetrics({
          plannedShiftStart: item.puesto.shiftStart,
          plannedShiftEnd: item.puesto.shiftEnd,
        });
        return {
          plannedShiftStart: item.puesto.shiftStart,
          plannedShiftEnd: item.puesto.shiftEnd,
          plannedMinutes: metrics.plannedMinutes,
          workedMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          tenantId,
          installationId: item.installationId,
          puestoId: item.puestoId,
          slotNumber: item.slotNumber,
          date,
          plannedGuardiaId: effectiveGuardiaId,
          attendanceStatus: status,
          createdBy,
        };
      }),
      skipDuplicates: true,
    });

    // Sincronizar "planificado" desde la pauta: las filas de asistencia pueden haberse creado
    // antes de pintar la serie, o pueden tener estados viejos (asistio/reemplazo) de cuando
    // había guardia y luego se desasignó. Actualizamos plannedGuardiaId y alineamos estado.
    for (const item of pauta) {
      const isAbsence = ABSENCE_CODES.includes(effectiveShiftCode(item) ?? "");
      const effectiveGuardiaId = item.replacementGuardiaId ?? item.plannedGuardiaId;
      await prisma.opsAsistenciaDiaria.updateMany({
        where: {
          tenantId,
          puestoId: item.puestoId,
          slotNumber: item.slotNumber,
          date,
        },
        data: {
          plannedGuardiaId: effectiveGuardiaId,
          plannedShiftStart: item.puesto.shiftStart,
          plannedShiftEnd: item.puesto.shiftEnd,
          plannedMinutes: computeAttendanceMetrics({
            plannedShiftStart: item.puesto.shiftStart,
            plannedShiftEnd: item.puesto.shiftEnd,
          }).plannedMinutes,
        },
      });
      if (isAbsence && !item.replacementGuardiaId) {
        // Ausencia sin reemplazo: forzar PPC para que aparezca como puesto por cubrir
        await prisma.opsAsistenciaDiaria.updateMany({
          where: {
            tenantId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date,
            attendanceStatus: { in: ["pendiente", "ppc"] },
          },
          data: { attendanceStatus: "ppc" },
        });
      } else if (effectiveGuardiaId != null) {
        // Hay guardia planificado (o reemplazo asignado): solo tocar status si la fila sigue en estado inicial
        await prisma.opsAsistenciaDiaria.updateMany({
          where: {
            tenantId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date,
            attendanceStatus: { in: ["pendiente", "ppc"] },
          },
          data: { attendanceStatus: "pendiente" },
        });
      } else {
        // No hay guardia en pauta (slot PPC): forzar estado PPC solo en filas que siguen en estado
        // inicial (sin reemplazo). No tocar filas que ya tienen reemplazo/TE asignado.
        const rows = await prisma.opsAsistenciaDiaria.findMany({
          where: {
            tenantId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date,
            lockedAt: null,
            replacementGuardiaId: null,
            attendanceStatus: { in: ["pendiente", "ppc"] },
          },
          select: { id: true },
        });
        for (const row of rows) {
          const pendingTe = await prisma.opsTurnoExtra.findFirst({
            where: { asistenciaId: row.id, status: "pending" },
          });
          if (pendingTe) {
            await prisma.opsTurnoExtra.delete({ where: { id: pendingTe.id } });
          }
          await prisma.opsAsistenciaDiaria.update({
            where: { id: row.id },
            data: {
              attendanceStatus: "ppc",
              actualGuardiaId: null,
              replacementGuardiaId: null,
              teGenerated: false,
            },
          });
        }
      }
    }
  }
}
