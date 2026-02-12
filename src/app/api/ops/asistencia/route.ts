import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const dateRaw = request.nextUrl.searchParams.get("date") || toISODate(new Date());

    const date = parseDateOnly(dateRaw);

    // If installationId = "all", get all installations
    const installationFilter = installationId && installationId !== "all"
      ? { installationId }
      : {};

    // Auto-create asistencia rows from pauta mensual (only for active puestos)
    const pauta = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
        puesto: { active: true },
      },
      select: {
        puestoId: true,
        slotNumber: true,
        plannedGuardiaId: true,
        installationId: true,
      },
    });

    // Limpiar asistencias huérfanas de puestos inactivos (no bloqueadas, sin TE aprobado/pagado)
    const orphanedRows = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
        puesto: { active: false },
        lockedAt: null,
      },
      select: { id: true },
    });
    if (orphanedRows.length > 0) {
      const orphanIds = orphanedRows.map((r) => r.id);
      // Delete pending TEs linked to orphaned asistencia
      await prisma.opsTurnoExtra.deleteMany({
        where: { asistenciaId: { in: orphanIds }, status: "pending" },
      });
      await prisma.opsAsistenciaDiaria.deleteMany({
        where: { id: { in: orphanIds } },
      });
    }

    if (pauta.length > 0) {
      await prisma.opsAsistenciaDiaria.createMany({
        data: pauta.map((item) => ({
          tenantId: ctx.tenantId,
          installationId: item.installationId,
          puestoId: item.puestoId,
          slotNumber: item.slotNumber,
          date,
          plannedGuardiaId: item.plannedGuardiaId,
          attendanceStatus: item.plannedGuardiaId ? "pendiente" : "ppc",
          createdBy: ctx.userId,
        })),
        skipDuplicates: true,
      });

      // Sincronizar "planificado" desde la pauta: las filas de asistencia pueden haberse creado
      // antes de pintar la serie, o pueden tener estados viejos (asistio/reemplazo) de cuando
      // había guardia y luego se desasignó. Actualizamos plannedGuardiaId y alineamos estado.
      for (const item of pauta) {
        await prisma.opsAsistenciaDiaria.updateMany({
          where: {
            tenantId: ctx.tenantId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date,
          },
          data: {
            plannedGuardiaId: item.plannedGuardiaId,
          },
        });
        if (item.plannedGuardiaId != null) {
          // Hay guardia planificado: solo tocar status si la fila sigue en estado inicial
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

    return NextResponse.json({
      success: true,
      data: {
        date: dateRaw,
        items: asistencia,
      },
    });
  } catch (error) {
    console.error("[OPS] Error listing asistencia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la asistencia diaria" },
      { status: 500 }
    );
  }
}
