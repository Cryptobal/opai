import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { EVENT_SUBTYPES } from "@/lib/guard-events";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const dateRaw = request.nextUrl.searchParams.get("date") || toISODate(new Date());

    const date = parseDateOnly(dateRaw);

    // If installationId = "all", get all installations
    const installationFilter = installationId && installationId !== "all"
      ? { installationId }
      : {};

    // Auto-create asistencia rows from pauta mensual
    // Días con shiftCode="T" (trabajo) + ausencias (V/L/PCG/PSG) generan filas.
    // Días libres ("-") y sin serie no generan filas en asistencia.
    const ABSENCE_CODES = ["V", "L", "PCG", "PSG"];
    const pauta = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
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

    // Overlay de ausencias aprobadas como fuente de verdad.
    // La pauta mensual puede NO haberse repintado (V/L/PCG/PSG) si el evento se
    // aprobó antes de generar la pauta del mes o si la serie se regeneró luego.
    // En vez de depender solo del shiftCode pintado, consultamos los eventos de
    // ausencia aprobados que cubren la fecha y los superponemos sobre la pauta:
    // así un guardia con permiso/licencia ese día siempre genera PPC aunque su
    // celda haya quedado en "T".
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
            tenantId: ctx.tenantId,
            guardiaId: { in: plannedGuardiaIds },
            category: "ausencia",
            status: "approved",
            startDate: { lte: date },
            endDate: { gte: date },
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
    // Código de turno efectivo: superpone la ausencia aprobada sobre la celda planificada.
    const effectiveShiftCode = (item: {
      plannedGuardiaId: string | null;
      shiftCode: string | null;
    }): string | null => {
      if (item.plannedGuardiaId) {
        const overlay = absenceCodeByGuardia.get(item.plannedGuardiaId);
        if (overlay) return overlay;
      }
      return item.shiftCode;
    };

    // Limpiar asistencias huérfanas de puestos inactivos (no bloqueadas, sin reemplazo/TE)
    // Nunca borrar filas con replacementGuardiaId: tienen TE asignado y deben persistir
    const orphanedRows = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
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
        tenantId: ctx.tenantId,
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
            tenantId: ctx.tenantId,
            installationId: item.installationId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date,
            plannedGuardiaId: effectiveGuardiaId,
            attendanceStatus: status,
            createdBy: ctx.userId,
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
            tenantId: ctx.tenantId,
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
              tenantId: ctx.tenantId,
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
              tenantId: ctx.tenantId,
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
              tenantId: ctx.tenantId,
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

    const asistencia = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
        puesto: { active: true },
      },
      include: {
        installation: {
          select: { id: true, name: true },
        },
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
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        actualGuardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
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
      orderBy: [
        { installation: { name: "asc" } },
        { puesto: { name: "asc" } },
        { slotNumber: "asc" },
      ],
    });

    const instIds = [...new Set(asistencia.map((a) => a.installationId))];
    const guardiaIds = [
      ...new Set(
        asistencia.flatMap((a) =>
          [a.actualGuardiaId, a.replacementGuardiaId, a.plannedGuardiaId].filter(
            (id): id is string => id != null
          )
        )
      ),
    ];

    const marcaciones =
      guardiaIds.length > 0 && instIds.length > 0
        ? await prisma.opsMarcacion.findMany({
          where: {
            tenantId: ctx.tenantId,
            guardiaId: { in: guardiaIds },
            installationId: { in: instIds },
            timestamp: {
              gte: new Date(date.getTime()),
              lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
            },
            deletedAt: null,
          },
          select: {
            id: true,
            guardiaId: true,
            installationId: true,
            tipo: true,
            timestamp: true,
            hashIntegridad: true,
            geoValidada: true,
            geoDistanciaM: true,
            gpsStatus: true,
            lat: true,
            lng: true,
            ipAddress: true,
            userAgent: true,
            metodoId: true,
            pinFallbackReason: true,
            fotoEvidenciaUrl: true,
            devicePairing: {
              select: { name: true, deviceModel: true },
            },
          },
          orderBy: { timestamp: "asc" },
        })
        : [];

    const toDeviceDisplay = (dp: { name: string | null; deviceModel: string | null } | null): string | null => {
      if (!dp) return null;
      if (dp.name) return `Equipo sincronizado: ${dp.name}`;
      if (dp.deviceModel) return `Dispositivo del usuario: ${dp.deviceModel}`;
      return "Dispositivo del portal";
    };

    const marcacionesByKey = new Map<string, Array<Omit<(typeof marcaciones)[number], "devicePairing"> & { deviceDisplay: string | null }>>();
    for (const m of marcaciones) {
      const key = `${m.guardiaId}|${m.installationId}`;
      const list = marcacionesByKey.get(key) ?? [];
      const { devicePairing, ...rest } = m;
      list.push({
        ...rest,
        deviceDisplay: toDeviceDisplay(devicePairing) ?? (m.userAgent ? "Navegador web" : null),
      });
      marcacionesByKey.set(key, list);
    }

    // Build absence code lookup from pauta (puestoId|slotNumber → shiftCode)
    // Usa el código efectivo (overlay de ausencias aprobadas) para que el motivo
    // se muestre aunque la celda de la pauta no se haya repintado.
    const absenceBySlot = new Map<string, string>();
    for (const p of pauta) {
      const code = effectiveShiftCode(p);
      if (code && ABSENCE_CODES.includes(code)) {
        absenceBySlot.set(`${p.puestoId}|${p.slotNumber}`, code);
      }
    }

    const itemsWithMarcaciones = asistencia.map((row) => {
      const guardiaId =
        row.actualGuardiaId ?? row.replacementGuardiaId ?? row.plannedGuardiaId;
      const key = guardiaId ? `${guardiaId}|${row.installationId}` : null;
      const marcacionesRow = key ? marcacionesByKey.get(key) ?? [] : [];
      const absenceCode = absenceBySlot.get(`${row.puestoId}|${row.slotNumber}`) ?? null;
      return {
        ...row,
        marcaciones: marcacionesRow,
        absenceCode,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        date: dateRaw,
        items: itemsWithMarcaciones,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[OPS] Error listing asistencia:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo obtener la asistencia diaria",
        errorDetail: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
