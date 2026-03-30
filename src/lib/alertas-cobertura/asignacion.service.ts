/**
 * Alertas de Cobertura — Auto-Asignación en Pauta y Payroll
 *
 * Se ejecuta cuando el supervisor confirma "SÍ se presentó" con asignación AUTOMÁTICA.
 * Crea OpsTurnoExtra (approved) + actualiza/crea OpsAsistenciaDiaria + vincula con alerta.
 */

import { prisma } from "@/lib/prisma";
import { startOfDay, differenceInMinutes, format } from "date-fns";

interface AsignacionResult {
  success: boolean;
  turnoExtraId?: string;
  asistenciaId?: string;
  error?: string;
}

export async function autoAsignarEnPauta(params: {
  tenantId: string;
  alertaId: string;
  guardiaId: string;
  installationId: string;
  puestoId: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  montoOfrecido: number;
  confirmadoPorId: string;
}): Promise<AsignacionResult> {
  return await prisma.$transaction(async (tx: any) => {
    // 1. Determinar puesto y slot
    let puestoId = params.puestoId;
    let slotNumber = 1;

    const fechaDate = startOfDay(params.fechaInicio);

    if (!puestoId) {
      // Buscar puestos de la instalación con slots sin cubrir
      const puestos = await tx.opsPuestoOperativo.findMany({
        where: {
          installationId: params.installationId,
          tenantId: params.tenantId,
          OR: [
            { activeUntil: null },
            { activeUntil: { gte: fechaDate } },
          ],
        },
        orderBy: { name: "asc" },
      });

      // Buscar el primer slot sin cobertura en OpsAsistenciaDiaria
      for (const puesto of puestos) {
        const asistenciaSinCubrir = await tx.opsAsistenciaDiaria.findFirst({
          where: {
            puestoId: puesto.id,
            date: fechaDate,
            attendanceStatus: { in: ["no_asistio", "pendiente"] },
            actualGuardiaId: null,
          },
        });

        if (asistenciaSinCubrir) {
          puestoId = puesto.id;
          slotNumber = asistenciaSinCubrir.slotNumber;
          break;
        }
      }

      // Si no encontró slot vacío, usar el primer puesto
      if (!puestoId && puestos.length > 0) {
        puestoId = puestos[0].id;
      }
    }

    if (!puestoId) {
      return { success: false, error: "No se encontró puesto operativo para asignar" };
    }

    // Si puestoId viene de la alerta pero no tenemos slotNumber, buscar slot sin cubrir
    if (params.puestoId && slotNumber === 1) {
      const asistenciaSinCubrir = await tx.opsAsistenciaDiaria.findFirst({
        where: {
          puestoId,
          date: fechaDate,
          attendanceStatus: { in: ["no_asistio", "pendiente"] },
          actualGuardiaId: null,
        },
      });
      if (asistenciaSinCubrir) {
        slotNumber = asistenciaSinCubrir.slotNumber;
      }
    }

    // 2. Upsert OpsAsistenciaDiaria
    const horaInicio = format(params.fechaInicio, "HH:mm");
    const horaFin = format(params.fechaFin, "HH:mm");
    const minutosPlaneados = differenceInMinutes(params.fechaFin, params.fechaInicio);

    const asistencia = await tx.opsAsistenciaDiaria.upsert({
      where: {
        puestoId_slotNumber_date: {
          puestoId,
          slotNumber,
          date: fechaDate,
        },
      },
      create: {
        tenantId: params.tenantId,
        installationId: params.installationId,
        puestoId,
        slotNumber,
        date: fechaDate,
        actualGuardiaId: params.guardiaId,
        replacementGuardiaId: params.guardiaId,
        attendanceStatus: "reemplazo",
        plannedShiftStart: horaInicio,
        plannedShiftEnd: horaFin,
        plannedMinutes: minutosPlaneados > 0 ? minutosPlaneados : 0,
        source: "manual",
        createdBy: params.confirmadoPorId,
      },
      update: {
        actualGuardiaId: params.guardiaId,
        replacementGuardiaId: params.guardiaId,
        attendanceStatus: "reemplazo",
      },
    });

    // 3. Crear OpsTurnoExtra con status=approved (supervisor ya confirmó)
    const turnoExtra = await tx.opsTurnoExtra.create({
      data: {
        tenantId: params.tenantId,
        asistenciaId: asistencia.id,
        installationId: params.installationId,
        puestoId,
        guardiaId: params.guardiaId,
        date: fechaDate,
        tipo: "turno_extra",
        amountClp: params.montoOfrecido,
        amountJustification: `Auto-generado por Alerta de Cobertura #${params.alertaId.slice(0, 8)}`,
        status: "approved",
        isManual: false,
        approvedBy: params.confirmadoPorId,
        approvedAt: new Date(),
        createdBy: params.confirmadoPorId,
      },
    });

    // 4. Vincular turnoExtra con la alerta y avanzar a ASIGNADA_PAUTA
    await tx.opsAlertaCobertura.update({
      where: { id: params.alertaId },
      data: {
        turnoExtraId: turnoExtra.id,
        estado: "ASIGNADA_PAUTA",
      },
    });

    // 5. Actualizar OpsPautaMensual si existe registro para esa fecha
    await tx.opsPautaMensual.updateMany({
      where: {
        puestoId,
        slotNumber,
        date: fechaDate,
        tenantId: params.tenantId,
      },
      data: {
        replacementGuardiaId: params.guardiaId,
        replacementReason: "alerta_cobertura",
      },
    });

    // 6. Audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.confirmadoPorId,
        action: "alerta_cobertura_asignada_pauta",
        entityType: "OpsTurnoExtra",
        entityId: turnoExtra.id,
        changes: {
          alertaId: params.alertaId,
          guardiaId: params.guardiaId,
          installationId: params.installationId,
          puestoId,
          slotNumber,
          monto: params.montoOfrecido,
        },
      },
    });

    return {
      success: true,
      turnoExtraId: turnoExtra.id,
      asistenciaId: asistencia.id,
    };
  });
}

export async function registrarAsignacionManual(params: {
  tenantId: string;
  alertaId: string;
  confirmadoPorId: string;
}): Promise<void> {
  await prisma.opsAlertaCobertura.update({
    where: { id: params.alertaId },
    data: {
      estado: "CONFIRMADA",
      confirmadaAt: new Date(),
      confirmadaPorId: params.confirmadoPorId,
      asignacionPauta: "MANUAL",
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.confirmadoPorId,
      action: "alerta_cobertura_asignacion_manual",
      entityType: "OpsAlertaCobertura",
      entityId: params.alertaId,
    },
  });
}
