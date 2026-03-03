import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateAsistenciaSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  decimalToNumber,
  ensureOpsAccess,
  parseDateOnly,
} from "@/lib/ops";
import { checkNoDoblar } from "@/lib/ops-no-doblar";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { computeMarcacionHash } from "@/lib/marcacion";
import { sendAvisoMarcaManual } from "@/lib/marcacion-email";
import { formatPersonName } from "@/lib/personas";

type Params = { id: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const parsed = await parseBody(request, updateAsistenciaSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const asistencia = await prisma.opsAsistenciaDiaria.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        puesto: {
          select: {
            id: true,
            name: true,
            installationId: true,
            teMontoClp: true,
            shiftStart: true,
            shiftEnd: true,
          },
        },
        installation: {
          select: {
            id: true,
            name: true,
            teMontoClp: true,
          },
        },
      },
    });
    if (!asistencia) {
      return NextResponse.json(
        { success: false, error: "Asistencia no encontrada" },
        { status: 404 }
      );
    }

    const guardiaIdsToValidate = [body.actualGuardiaId, body.replacementGuardiaId].filter(
      (value): value is string => Boolean(value)
    );
    if (guardiaIdsToValidate.length > 0) {
      const guardias = await prisma.opsGuardia.findMany({
        where: {
          id: { in: guardiaIdsToValidate },
          tenantId: ctx.tenantId,
        },
        select: { id: true, status: true, isBlacklisted: true },
      });
      if (guardias.length !== guardiaIdsToValidate.length) {
        return NextResponse.json(
          { success: false, error: "Uno o más guardias no existen" },
          { status: 404 }
        );
      }
      const invalid = guardias.find((g) => g.status !== "active" || g.isBlacklisted);
      if (invalid) {
        return NextResponse.json(
          { success: false, error: "No se puede asignar guardia inactivo o en lista negra" },
          { status: 400 }
        );
      }
    }

    // ── Restricción no doblar: el guardia no puede tener 2 turnos el mismo día (solapados o consecutivos) ──
    if (body.replacementGuardiaId) {
      const dateStr = asistencia.date.toISOString().slice(0, 10);
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      // Otros turnos en asistencia (planificado, reemplazo o actual) el mismo día
      const otrosAsistencia = await prisma.opsAsistenciaDiaria.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: { gte: dayStart, lt: dayEnd },
          id: { not: asistencia.id },
          OR: [
            { plannedGuardiaId: body.replacementGuardiaId },
            { replacementGuardiaId: body.replacementGuardiaId },
            { actualGuardiaId: body.replacementGuardiaId },
          ],
        },
        select: {
          plannedShiftStart: true,
          plannedShiftEnd: true,
          puesto: { select: { shiftStart: true, shiftEnd: true, name: true } },
          installation: { select: { name: true } },
        },
      });
      // TEs manuales del guardia el mismo día (sin asistenciaId; los con asistenciaId ya están en otrosAsistencia)
      const teManuales = await prisma.opsTurnoExtra.findMany({
        where: {
          tenantId: ctx.tenantId,
          guardiaId: body.replacementGuardiaId,
          date: { gte: dayStart, lt: dayEnd },
          status: { in: ["pending", "approved", "paid"] },
          asistenciaId: null,
        },
        select: {
          installation: { select: { name: true } },
          puesto: { select: { shiftStart: true, shiftEnd: true, name: true } },
        },
      });
      const existentes = [
        ...otrosAsistencia.map((r) => ({
          shiftStart: r.plannedShiftStart ?? r.puesto.shiftStart ?? "09:00",
          shiftEnd: r.plannedShiftEnd ?? r.puesto.shiftEnd ?? "19:00",
          installationName: r.installation.name,
          puestoName: r.puesto.name,
        })),
        ...teManuales.map((t) => ({
          shiftStart: t.puesto?.shiftStart ?? "06:00",
          shiftEnd: t.puesto?.shiftEnd ?? "22:00",
          installationName: t.installation.name,
          puestoName: t.puesto?.name ?? "TE manual",
        })),
      ];
      const nuevoShiftStart = asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart ?? "09:00";
      const nuevoShiftEnd = asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd ?? "19:00";
      const conflicto = checkNoDoblar(
        {
          shiftStart: nuevoShiftStart,
          shiftEnd: nuevoShiftEnd,
          installationName: asistencia.installation?.name,
          puestoName: asistencia.puesto?.name,
        },
        existentes
      );
      if (conflicto) {
        return NextResponse.json(
          { success: false, error: conflicto.message },
          { status: 400 }
        );
      }
    }

    const nextStatus =
      body.attendanceStatus ?? (body.replacementGuardiaId ? "reemplazo" : asistencia.attendanceStatus);
    const nextReplacementGuardiaId =
      body.replacementGuardiaId !== undefined
        ? body.replacementGuardiaId
        : asistencia.replacementGuardiaId;
    const nextActualGuardiaId =
      body.actualGuardiaId !== undefined
        ? body.actualGuardiaId
        : nextStatus === "reemplazo"
          ? null
          : asistencia.actualGuardiaId;

    const existingTe = await prisma.opsTurnoExtra.findFirst({
      where: { tenantId: ctx.tenantId, asistenciaId: asistencia.id },
      select: {
        id: true,
        status: true,
        guardiaId: true,
        paymentItems: {
          select: {
            id: true,
            loteId: true,
          },
        },
      },
    });

    const initialStatus: "pendiente" | "ppc" = asistencia.plannedGuardiaId ? "pendiente" : "ppc";
    const isResetToInitial =
      body.attendanceStatus === initialStatus &&
      body.actualGuardiaId === null &&
      body.replacementGuardiaId === null;
    const isAdminRole = ctx.userRole === "owner" || ctx.userRole === "admin";
    const forceDeletePaidTe = body.forceDeletePaidTe === true;
    const forceDeleteReason = body.forceDeleteReason?.trim() || null;

    if (
      existingTe &&
      (existingTe.status === "approved" || existingTe.status === "paid") &&
      nextReplacementGuardiaId &&
      existingTe.guardiaId !== nextReplacementGuardiaId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se puede cambiar el guardia de un turno extra ya aprobado/pagado. Rechaza o crea uno nuevo.",
        },
        { status: 400 }
      );
    }

    const checkInAt = body.checkInAt ? new Date(body.checkInAt) : undefined;
    const checkOutAt = body.checkOutAt ? new Date(body.checkOutAt) : undefined;
    const nextPlannedGuardiaId =
      body.plannedGuardiaId !== undefined ? body.plannedGuardiaId : asistencia.plannedGuardiaId;

    // When switching to "reemplazo", clear check-in/out from previous guard
    // unless the caller explicitly sends them
    const switchingToReemplazo = nextStatus === "reemplazo" && asistencia.attendanceStatus !== "reemplazo";
    const nextCheckInAt =
      body.checkInAt !== undefined ? (checkInAt ?? null)
        : switchingToReemplazo ? null
        : asistencia.checkInAt;
    const nextCheckOutAt =
      body.checkOutAt !== undefined ? (checkOutAt ?? null)
        : switchingToReemplazo ? null
        : asistencia.checkOutAt;
    const nextCheckInSource =
      body.checkInAt !== undefined
        ? body.checkInAt
          ? "manual"
          : "none"
        : asistencia.checkInSource ?? "none";
    const nextCheckOutSource =
      body.checkOutAt !== undefined
        ? body.checkOutAt
          ? "manual"
          : "none"
        : asistencia.checkOutSource ?? "none";

    const metrics = nextPlannedGuardiaId
      ? computeAttendanceMetrics({
          plannedShiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart,
          plannedShiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd,
          checkInAt: nextCheckInAt,
          checkOutAt: nextCheckOutAt,
        })
      : {
          plannedMinutes: 0,
          workedMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
        };

    if (isResetToInitial && existingTe?.status === "paid") {
      if (!isAdminRole) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No se puede resetear: este turno extra ya está pagado. Solo un admin puede forzar la eliminación.",
          },
          { status: 409 }
        );
      }
      if (!forceDeletePaidTe) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Este turno extra ya está pagado. Si deseas eliminarlo, confirma forzar eliminación e indica motivo.",
          },
          { status: 409 }
        );
      }
      if (!forceDeleteReason) {
        return NextResponse.json(
          {
            success: false,
            error: "Debes indicar un motivo para forzar la eliminación de un turno extra pagado.",
          },
          { status: 400 }
        );
      }
    }

    // ── Si es reset, eliminar marcaciones manuales huérfanas + emails pendientes ──
    if (isResetToInitial) {
      const todayStartReset = new Date(asistencia.date);
      todayStartReset.setHours(0, 0, 0, 0);
      const todayEndReset = new Date(todayStartReset);
      todayEndReset.setDate(todayEndReset.getDate() + 1);

      const deletedManual = await prisma.opsMarcacion.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          installationId: asistencia.installationId,
          puestoId: asistencia.puestoId,
          slotNumber: asistencia.slotNumber,
          metodoId: "manual",
          timestamp: { gte: todayStartReset, lt: todayEndReset },
        },
      });
      if (deletedManual.count > 0) {
        console.log(`[OPS] Reset: eliminadas ${deletedManual.count} marcación(es) manual(es) huérfana(s)`);
      }

      // Eliminar email pendiente (si hay delay configurado)
      const pendingKey = `pending_marcacion_email:${asistencia.id}`;
      await prisma.setting.deleteMany({
        where: { key: pendingKey },
      }).catch(() => { /* no-op si no existía */ });
    }

    const updatedAsistencia = await prisma.opsAsistenciaDiaria.update({
      where: { id: asistencia.id },
      data: {
        attendanceStatus: nextStatus,
        actualGuardiaId: nextActualGuardiaId,
        replacementGuardiaId: nextReplacementGuardiaId,
        plannedGuardiaId: nextPlannedGuardiaId,
        notes: body.notes !== undefined ? body.notes : asistencia.notes,
        checkInAt: nextCheckInAt,
        checkOutAt: nextCheckOutAt,
        checkInSource: nextCheckInSource,
        checkOutSource: nextCheckOutSource,
        plannedMinutes: metrics.plannedMinutes,
        workedMinutes: metrics.workedMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        lateMinutes: metrics.lateMinutes,
        hoursCalculatedAt: new Date(),
      },
    });

    let teId: string | null = existingTe?.id ?? null;
    const shouldGenerateTe =
      nextStatus === "reemplazo" && Boolean(updatedAsistencia.replacementGuardiaId);

    if (shouldGenerateTe && updatedAsistencia.replacementGuardiaId) {
      const amountClp =
        decimalToNumber(asistencia.puesto.teMontoClp) ||
        decimalToNumber(asistencia.installation.teMontoClp) ||
        0;

      const date = parseDateOnly(updatedAsistencia.date.toISOString().slice(0, 10));

      const te = existingTe
        ? await prisma.opsTurnoExtra.update({
            where: { id: existingTe.id },
            data: {
              installationId: asistencia.installationId,
              puestoId: asistencia.puestoId,
              guardiaId: updatedAsistencia.replacementGuardiaId,
              date,
              amountClp,
              status: existingTe.status === "paid" ? "paid" : "pending",
              rejectedAt: null,
              rejectedBy: null,
              rejectionReason: null,
            },
          })
        : await prisma.opsTurnoExtra.create({
            data: {
              tenantId: ctx.tenantId,
              asistenciaId: asistencia.id,
              installationId: asistencia.installationId,
              puestoId: asistencia.puestoId,
              guardiaId: updatedAsistencia.replacementGuardiaId,
              date,
              amountClp,
              status: "pending",
              createdBy: ctx.userId,
            },
          });

      teId = te.id;

      await prisma.opsAsistenciaDiaria.update({
        where: { id: asistencia.id },
        data: { teGenerated: true },
      });
    } else if (existingTe) {
      const canDeleteTeOnReset =
        isResetToInitial &&
        (existingTe.status === "pending" ||
          existingTe.status === "approved" ||
          (existingTe.status === "paid" && forceDeletePaidTe));
      const canDeleteTeByRegularFlow = !isResetToInitial && existingTe.status === "pending";

      if (canDeleteTeOnReset || canDeleteTeByRegularFlow) {
        await prisma.$transaction(async (tx) => {
          if (existingTe.paymentItems.length > 0) {
            const loteIds = [...new Set(existingTe.paymentItems.map((item) => item.loteId))];
            await tx.opsPagoTeItem.deleteMany({
              where: {
                tenantId: ctx.tenantId,
                turnoExtraId: existingTe.id,
              },
            });

            for (const loteId of loteIds) {
              const remainingItems = await tx.opsPagoTeItem.findMany({
                where: { tenantId: ctx.tenantId, loteId },
                select: { amountClp: true },
              });
              if (remainingItems.length === 0) {
                await tx.opsPagoTeLote.delete({ where: { id: loteId } });
                continue;
              }
              const totalAmountClp = remainingItems.reduce(
                (acc, item) => acc + Number(item.amountClp),
                0
              );
              await tx.opsPagoTeLote.update({
                where: { id: loteId },
                data: { totalAmountClp },
              });
            }
          }

          await tx.opsTurnoExtra.delete({ where: { id: existingTe.id } });
          await tx.opsAsistenciaDiaria.update({
            where: { id: asistencia.id },
            data: { teGenerated: false },
          });
        });
        teId = null;
      }
    }

    const result = await prisma.opsAsistenciaDiaria.findFirst({
      where: { id: asistencia.id, tenantId: ctx.tenantId },
      include: {
        installation: {
          select: { id: true, name: true },
        },
        puesto: {
          select: { id: true, name: true, shiftStart: true, shiftEnd: true, teMontoClp: true, requiredGuards: true },
        },
        plannedGuardia: {
          select: { id: true, code: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
        },
        actualGuardia: {
          select: { id: true, code: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
        },
        replacementGuardia: {
          select: { id: true, code: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
        },
        turnosExtra: {
          select: { id: true, status: true, amountClp: true, guardiaId: true },
        },
      },
    });

    await createOpsAuditLog(ctx, "ops.asistencia.updated", "ops_asistencia", asistencia.id, {
      attendanceStatus: nextStatus,
      replacementGuardiaId: updatedAsistencia.replacementGuardiaId,
      turnoExtraId: teId,
      forceDeletePaidTe,
      forceDeleteReason,
    });

    // ── Limpiar marcaciones manuales huérfanas al cambiar a reemplazo ──
    if (switchingToReemplazo && asistencia.plannedGuardiaId) {
      try {
        const dayStart = new Date(updatedAsistencia.date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        await prisma.opsMarcacion.deleteMany({
          where: {
            guardiaId: asistencia.plannedGuardiaId,
            installationId: asistencia.installationId,
            timestamp: { gte: dayStart, lt: dayEnd },
            metodoId: "manual",
          },
        });
      } catch { /* non-critical */ }
    }

    // ── Marca manual + email de aviso (solo para "asistio", NO para "reemplazo") ──
    // Reemplazos registran marcación cuando el guardia de reemplazo marca por sí mismo
    const guardiaIdParaMarca =
      nextStatus === "asistio"
        ? (updatedAsistencia.actualGuardiaId ?? updatedAsistencia.plannedGuardiaId)
        : null;

    if (nextStatus === "asistio" && guardiaIdParaMarca) {
      try {
        const todayStart = new Date(updatedAsistencia.date);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const existingDigitalMarcacion = await prisma.opsMarcacion.findFirst({
          where: {
            guardiaId: guardiaIdParaMarca,
            installationId: asistencia.installationId,
            timestamp: { gte: todayStart, lt: todayEnd },
            metodoId: { not: "manual" },
          },
        });

        if (!existingDigitalMarcacion) {
          const serverTimestamp = new Date();
          const dateStr = updatedAsistencia.date.toISOString().slice(0, 10);
          const shiftStart = result?.puesto?.shiftStart ?? "09:00";

          const hashIntegridad = computeMarcacionHash({
            guardiaId: guardiaIdParaMarca,
            installationId: asistencia.installationId,
            tipo: "entrada",
            timestamp: serverTimestamp.toISOString(),
            lat: null,
            lng: null,
            metodoId: "manual",
            tenantId: ctx.tenantId,
          });

          const existingManualMarcacion = await prisma.opsMarcacion.findFirst({
            where: {
              guardiaId: guardiaIdParaMarca,
              installationId: asistencia.installationId,
              timestamp: { gte: todayStart, lt: todayEnd },
              metodoId: "manual",
            },
          });

          if (!existingManualMarcacion) {
            await prisma.opsMarcacion.create({
              data: {
                tenantId: ctx.tenantId,
                guardiaId: guardiaIdParaMarca,
                installationId: asistencia.installationId,
                puestoId: asistencia.puestoId,
                slotNumber: asistencia.slotNumber,
                tipo: "entrada",
                timestamp: serverTimestamp,
                lat: null,
                lng: null,
                geoValidada: false,
                geoDistanciaM: null,
                metodoId: "manual",
                ipAddress: null,
                userAgent: "manual-admin",
                hashIntegridad,
              },
            });
          }

          const marcacionConfigSetting = await prisma.setting.findFirst({
            where: { key: `marcacion_config:${ctx.tenantId}` },
          });
          let emailEnabled = true;
          let emailDelayMinutos = 0;
          let clausulaLegal =
            "Si transcurridas las 48 horas de recibir esta notificación usted no se hubiera opuesto al nuevo ajuste, ésta será considerada válida para los efectos de cálculo de su jornada.";
          if (marcacionConfigSetting?.value) {
            try {
              const cfg = JSON.parse(marcacionConfigSetting.value);
              emailEnabled = cfg.emailAvisoMarcaManualEnabled !== false;
              emailDelayMinutos = Number(cfg.emailDelayManualMinutos) || 0;
              if (cfg.clausulaLegal) clausulaLegal = cfg.clausulaLegal;
            } catch { /* use defaults */ }
          }

          if (emailEnabled) {
            const guardiaData = await prisma.opsGuardia.findFirst({
              where: { id: guardiaIdParaMarca, tenantId: ctx.tenantId },
              select: {
                persona: { select: { firstName: true, lastName: true, rut: true, email: true } },
              },
            });

            if (guardiaData?.persona) {
              const p = guardiaData.persona;
              if (!p.email) {
                console.warn(`[OPS] Guardia ${formatPersonName(p.firstName, p.lastName)} no tiene email — no se envía aviso de marca manual`);
              } else {
                const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
                const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
                const emailPayload = {
                  guardiaName: formatPersonName(p.firstName, p.lastName),
                  guardiaEmail: p.email,
                  guardiaRut: p.rut ?? "",
                  installationName: result?.installation?.name ?? "Instalación",
                  empresaName: tenantCfg.companyName,
                  empresaRut: tenantCfg.rut,
                  tipo: "entrada" as const,
                  fechaMarca: dateStr,
                  horaMarca: shiftStart + ":00",
                  tipoAjuste: "Omitido",
                  hashIntegridad,
                  registradoPor: ctx.userEmail ?? "Supervisor",
                  clausulaLegal,
                };

                if (emailDelayMinutos > 0) {
                  // Delay: guardar datos del email pendiente en Setting para el cron
                  const pendingKey = `pending_marcacion_email:${asistencia.id}`;
                  const pendingData = JSON.stringify({
                    ...emailPayload,
                    sendAfter: new Date(Date.now() + emailDelayMinutos * 60 * 1000).toISOString(),
                    asistenciaId: asistencia.id,
                    marcacionGuardiaId: guardiaIdParaMarca,
                    installationId: asistencia.installationId,
                  });
                  await prisma.setting.upsert({
                    where: { id: pendingKey },
                    update: { value: pendingData },
                    create: {
                      id: pendingKey,
                      key: pendingKey,
                      value: pendingData,
                      type: "json",
                      category: "pending_email",
                      tenantId: ctx.tenantId,
                    },
                  }).catch((err) => console.error("[OPS] Error guardando email pendiente:", err));
                  console.log(`[OPS] Email de marca manual diferido ${emailDelayMinutos} min para guardia ${formatPersonName(p.firstName, p.lastName)}`);
                } else {
                  // Envío inmediato
                  sendAvisoMarcaManual(emailPayload).catch((err) =>
                    console.error("[OPS] Error enviando aviso marca manual:", err)
                  );
                }
              }
            }
          }
        }
      } catch (marcaErr) {
        console.error("[OPS] Error creando marca manual / aviso (asistencia ya actualizada):", marcaErr);
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[OPS] Error updating asistencia:", message, stack);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar la asistencia",
        ...(process.env.NODE_ENV === "development" && { detail: message }),
      },
      { status: 500 }
    );
  }
}
