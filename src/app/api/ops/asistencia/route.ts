import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";

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
    // Solo días con serie pintada y shiftCode="T" (día de trabajo).
    // Días libres ("-") y sin serie no generan filas en asistencia.
    const pauta = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
        puesto: { active: true },
        shiftCode: "T",
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
    const ghostIds = allAsistenciaForDate
      .filter((row) => !pautaKeys.has(`${row.puestoId}|${row.slotNumber}`))
      .map((row) => row.id);
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
              lat: true,
              lng: true,
              ipAddress: true,
              userAgent: true,
            },
            orderBy: { timestamp: "asc" },
          })
        : [];

    const marcacionesByKey = new Map<string, typeof marcaciones>();
    for (const m of marcaciones) {
      const key = `${m.guardiaId}|${m.installationId}`;
      const list = marcacionesByKey.get(key) ?? [];
      list.push(m);
      marcacionesByKey.set(key, list);
    }

    const itemsWithMarcaciones = asistencia.map((row) => {
      const guardiaId =
        row.actualGuardiaId ?? row.replacementGuardiaId ?? row.plannedGuardiaId;
      const key = guardiaId ? `${guardiaId}|${row.installationId}` : null;
      const marcacionesRow = key ? marcacionesByKey.get(key) ?? [] : [];
      return {
        ...row,
        marcaciones: marcacionesRow,
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
    console.error("[OPS] Error listing asistencia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la asistencia diaria" },
      { status: 500 }
    );
  }
}
