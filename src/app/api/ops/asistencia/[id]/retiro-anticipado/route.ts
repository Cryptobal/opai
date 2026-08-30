import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { retiroAnticipadoSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  decimalToNumber,
  ensureOpsAccess,
  parseDateOnly,
} from "@/lib/ops";
import { checkNoDoblar } from "@/lib/ops-no-doblar";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";

type Params = { id: string };

/**
 * POST /api/ops/asistencia/[id]/retiro-anticipado
 *
 * Registra salida anticipada sin cambiar attendanceStatus (sigue "asistio").
 * Conserva horas parciales del titular. Opcionalmente crea TE vinculado para
 * cubrir el resto del turno (PPC operacional del día).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, retiroAnticipadoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const asistencia = await prisma.opsAsistenciaDiaria.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        puesto: {
          select: {
            id: true,
            name: true,
            teMontoClp: true,
            shiftStart: true,
            shiftEnd: true,
          },
        },
        installation: {
          select: { id: true, name: true, teMontoClp: true },
        },
        plannedGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
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
    if (asistencia.lockedAt) {
      return NextResponse.json(
        { success: false, error: "El turno está bloqueado y no se puede modificar" },
        { status: 409 }
      );
    }
    if (asistencia.attendanceStatus !== "asistio") {
      return NextResponse.json(
        { success: false, error: "Solo se puede registrar retiro anticipado con status asistió" },
        { status: 400 }
      );
    }
    if (!asistencia.checkInAt) {
      return NextResponse.json(
        { success: false, error: "Se requiere check-in previo para retiro anticipado" },
        { status: 400 }
      );
    }

    const checkOutAt = new Date(body.checkOutAt);
    if (Number.isNaN(checkOutAt.getTime())) {
      return NextResponse.json(
        { success: false, error: "checkOutAt inválido" },
        { status: 400 }
      );
    }
    if (checkOutAt.getTime() <= asistencia.checkInAt.getTime()) {
      return NextResponse.json(
        { success: false, error: "La hora de salida debe ser posterior a la entrada" },
        { status: 400 }
      );
    }

    // TE activo vinculado (pending/approved/paid)
    const existingTe = await prisma.opsTurnoExtra.findFirst({
      where: {
        tenantId: ctx.tenantId,
        asistenciaId: asistencia.id,
        status: { in: ["pending", "approved", "paid"] },
      },
      select: { id: true, status: true, guardiaId: true },
    });

    const cobertura = body.cobertura;
    if (cobertura && existingTe) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ya existe un turno extra vinculado a este turno. No se puede crear otra cobertura de retiro anticipado.",
        },
        { status: 409 }
      );
    }

    const titularId =
      asistencia.actualGuardiaId ?? asistencia.plannedGuardiaId ?? null;

    if (cobertura) {
      if (titularId && cobertura.guardiaId === titularId) {
        return NextResponse.json(
          { success: false, error: "El guardia de cobertura no puede ser el titular del turno" },
          { status: 400 }
        );
      }

      const guardia = await prisma.opsGuardia.findFirst({
        where: { id: cobertura.guardiaId, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          isBlacklisted: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      });
      if (!guardia) {
        return NextResponse.json(
          { success: false, error: "Guardia de cobertura no encontrado" },
          { status: 404 }
        );
      }
      if (guardia.status !== "active" || guardia.isBlacklisted) {
        return NextResponse.json(
          {
            success: false,
            error: "No se puede asignar guardia inactivo o en lista negra",
          },
          { status: 400 }
        );
      }

      // Anti-doblada (mismo patrón del PATCH)
      const dateStr = asistencia.date.toISOString().slice(0, 10);
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const otrosAsistencia = await prisma.opsAsistenciaDiaria.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: { gte: dayStart, lt: dayEnd },
          id: { not: asistencia.id },
          OR: [
            { plannedGuardiaId: cobertura.guardiaId },
            { replacementGuardiaId: cobertura.guardiaId },
            { actualGuardiaId: cobertura.guardiaId },
          ],
        },
        select: {
          plannedShiftStart: true,
          plannedShiftEnd: true,
          puesto: { select: { shiftStart: true, shiftEnd: true, name: true } },
          installation: { select: { name: true } },
        },
      });
      const teManuales = await prisma.opsTurnoExtra.findMany({
        where: {
          tenantId: ctx.tenantId,
          guardiaId: cobertura.guardiaId,
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
      const conflicto = checkNoDoblar(
        {
          shiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart ?? "09:00",
          shiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd ?? "19:00",
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

    const metrics = computeAttendanceMetrics({
      plannedShiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart,
      plannedShiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd,
      checkInAt: asistencia.checkInAt,
      checkOutAt,
    });

    const earlyDepartureAt = asistencia.earlyDepartureAt ?? new Date();
    const remainingStart =
      `${String(checkOutAt.getUTCHours()).padStart(2, "0")}:${String(checkOutAt.getUTCMinutes()).padStart(2, "0")}`;
    const plannedEnd =
      asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd ?? "19:00";

    const { teId } = await prisma.$transaction(async (tx) => {
      await tx.opsAsistenciaDiaria.update({
        where: { id: asistencia.id },
        data: {
          checkOutAt,
          checkOutSource: "manual",
          earlyDepartureAt,
          earlyDepartureReason: body.reason,
          plannedMinutes: metrics.plannedMinutes,
          workedMinutes: metrics.workedMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          lateMinutes: metrics.lateMinutes,
          hoursCalculatedAt: new Date(),
          // status permanece "asistio"
        },
      });

      let teId: string | null = existingTe?.id ?? null;

      if (cobertura) {
        const baseAmountClp =
          decimalToNumber(asistencia.puesto.teMontoClp) ||
          decimalToNumber(asistencia.installation.teMontoClp) ||
          0;
        const amountClp = cobertura.amountClp ?? baseAmountClp;
        const amountJustification =
          cobertura.amountJustification ??
          `Cobertura retiro anticipado · ${remainingStart}–${plannedEnd}`;

        const date = parseDateOnly(asistencia.date.toISOString().slice(0, 10));
        const te = await tx.opsTurnoExtra.create({
          data: {
            tenantId: ctx.tenantId,
            asistenciaId: asistencia.id,
            installationId: asistencia.installationId,
            puestoId: asistencia.puestoId,
            guardiaId: cobertura.guardiaId,
            date,
            amountClp,
            amountJustification,
            status: "pending",
            createdBy: ctx.userId,
          },
        });
        teId = te.id;
        await tx.opsAsistenciaDiaria.update({
          where: { id: asistencia.id },
          data: { teGenerated: true },
        });
      }

      return { teId };
    });

    await createOpsAuditLog(
      ctx,
      "asistencia.retiro_anticipado",
      "ops_asistencia",
      asistencia.id,
      {
        checkOutAt: checkOutAt.toISOString(),
        reason: body.reason,
        turnoExtraId: teId,
        coberturaGuardiaId: cobertura?.guardiaId ?? null,
        workedMinutes: metrics.workedMinutes,
      }
    );

    if (teId && cobertura) {
      try {
        const guardia = await prisma.opsGuardia.findFirst({
          where: { id: cobertura.guardiaId },
          select: { persona: { select: { firstName: true, lastName: true } } },
        });
        const guardiaNombre =
          [guardia?.persona?.firstName, guardia?.persona?.lastName]
            .filter(Boolean)
            .join(" ") || "Guardia";
        const te = await prisma.opsTurnoExtra.findFirst({
          where: { id: teId },
          select: { amountClp: true, date: true, amountJustification: true },
        });
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId: ctx.tenantId,
          type: "te_created",
          title: "Turno extra por aprobar",
          body: `${guardiaNombre} · ${asistencia.installation.name} · $${Number(te?.amountClp ?? 0).toLocaleString("es-CL")}`,
          link: `/ops/turnos-extra/aprobaciones?te=${teId}&ym=${(te?.date ?? asistencia.date).toISOString().slice(0, 7)}`,
          data: {
            teId,
            guardia: guardiaNombre,
            instalacion: asistencia.installation.name,
            montoClp: Number(te?.amountClp ?? 0),
            fecha: (te?.date ?? asistencia.date).toISOString().slice(0, 10),
            justificacion: te?.amountJustification ?? null,
          },
        });
      } catch (err) {
        console.error("[OPS] Error notifying te_created (retiro anticipado):", err);
      }
    }

    const result = await prisma.opsAsistenciaDiaria.findFirst({
      where: { id: asistencia.id, tenantId: ctx.tenantId },
      include: {
        installation: { select: { id: true, name: true } },
        puesto: {
          select: {
            id: true,
            name: true,
            shiftStart: true,
            shiftEnd: true,
            teMontoClp: true,
            requiredGuards: true,
          },
        },
        plannedGuardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        actualGuardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        turnosExtra: {
          select: {
            id: true,
            status: true,
            amountClp: true,
            amountJustification: true,
            tipo: true,
            horasExtra: true,
            guardiaId: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[OPS] Error retiro anticipado:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo registrar el retiro anticipado" },
      { status: 500 }
    );
  }
}
