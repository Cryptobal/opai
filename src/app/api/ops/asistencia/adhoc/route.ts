import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createAsistenciaAdhocSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  ensureOpsAccess,
  parseDateOnly,
} from "@/lib/ops";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";

/** Slot mínimo para filas ad-hoc (no colisiona con slots de pauta, típicamente 1..N). */
const ADHOC_SLOT_MIN = 101;

/**
 * POST /api/ops/asistencia/adhoc
 *
 * Crea un PPC ad-hoc (inducción / refuerzo / otro) que no proviene de la pauta.
 * Sobrevive a ensureAsistenciaDia gracias a isAdhoc=true.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createAsistenciaAdhocSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const date = parseDateOnly(body.date);

    const [installation, puesto] = await Promise.all([
      prisma.crmInstallation.findFirst({
        where: { id: body.installationId, tenantId: ctx.tenantId, status: "active" },
        select: { id: true, name: true },
      }),
      prisma.opsPuestoOperativo.findFirst({
        where: {
          id: body.puestoId,
          tenantId: ctx.tenantId,
          installationId: body.installationId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          shiftStart: true,
          shiftEnd: true,
          teMontoClp: true,
          requiredGuards: true,
        },
      }),
    ]);

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada o inactiva" },
        { status: 404 }
      );
    }
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado, inactivo o no pertenece a la instalación" },
        { status: 404 }
      );
    }

    const shiftStart = body.shiftStart ?? puesto.shiftStart ?? "09:00";
    const shiftEnd = body.shiftEnd ?? puesto.shiftEnd ?? "19:00";
    const metrics = computeAttendanceMetrics({
      plannedShiftStart: shiftStart,
      plannedShiftEnd: shiftEnd,
    });

    const created = await prisma.$transaction(async (tx) => {
      const maxSlot = await tx.opsAsistenciaDiaria.aggregate({
        where: {
          tenantId: ctx.tenantId,
          puestoId: puesto.id,
          date,
          slotNumber: { gte: ADHOC_SLOT_MIN },
        },
        _max: { slotNumber: true },
      });
      const slotNumber = Math.max(
        ADHOC_SLOT_MIN,
        (maxSlot._max.slotNumber ?? ADHOC_SLOT_MIN - 1) + 1
      );

      return tx.opsAsistenciaDiaria.create({
        data: {
          tenantId: ctx.tenantId,
          installationId: installation.id,
          puestoId: puesto.id,
          slotNumber,
          date,
          plannedGuardiaId: null,
          attendanceStatus: "ppc",
          plannedShiftStart: shiftStart,
          plannedShiftEnd: shiftEnd,
          plannedMinutes: metrics.plannedMinutes,
          workedMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          isAdhoc: true,
          adhocReason: body.reason,
          notes: body.notes ?? null,
          createdBy: ctx.userId,
          source: "manual",
        },
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
    });

    await createOpsAuditLog(ctx, "asistencia.adhoc_created", "ops_asistencia", created.id, {
      reason: body.reason,
      puestoId: puesto.id,
      installationId: installation.id,
      slotNumber: created.slotNumber,
      date: body.date,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creando PPC ad-hoc:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el PPC ad-hoc" },
      { status: 500 }
    );
  }
}
