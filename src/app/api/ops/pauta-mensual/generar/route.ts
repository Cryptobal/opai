import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { generatePautaSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  ensureOpsAccess,
  getMonthDateRange,
  listDatesBetween,
} from "@/lib/ops";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, generatePautaSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const puestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        active: true,
      },
      select: {
        id: true,
        weekdays: true,
        requiredGuards: true,
        activeFrom: true,
        activeUntil: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (puestos.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay puestos activos para la instalación seleccionada" },
        { status: 400 }
      );
    }

    const { start, end } = getMonthDateRange(body.year, body.month);
    const monthDates = listDatesBetween(start, end);

    // Generate rows: for each puesto × slot × every day of the month
    // The pauta covers day 1 to last day — series painting determines work/rest
    const data = monthDates.flatMap((date) => {
      return puestos
        .filter((puesto) => {
          // Only check active range, not weekdays
          if (puesto.activeFrom && date < puesto.activeFrom) return false;
          if (puesto.activeUntil && date >= puesto.activeUntil) return false;
          return true;
        })
        .flatMap((puesto) => {
          const slots: {
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
          for (let slot = 1; slot <= puesto.requiredGuards; slot++) {
            slots.push({
              tenantId: ctx.tenantId,
              installationId: body.installationId,
              puestoId: puesto.id,
              slotNumber: slot,
              date,
              plannedGuardiaId: null,
              shiftCode: null,
              status: "planificado",
              createdBy: ctx.userId,
            });
          }
          return slots;
        });
    });

    if (data.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          created: 0,
          message: "No se generaron filas: revisa días activos en puestos",
        },
      });
    }

    if (body.overwrite) {
      await prisma.opsPautaMensual.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          installationId: body.installationId,
          date: { gte: start, lte: end },
        },
      });

      await prisma.opsPautaMensual.createMany({
        data,
        skipDuplicates: false,
      });
    } else {
      await prisma.opsPautaMensual.createMany({
        data,
        skipDuplicates: true,
      });
    }

    await createOpsAuditLog(ctx, "ops.pauta.generated", "ops_pauta", body.installationId, {
      installationId: body.installationId,
      month: body.month,
      year: body.year,
      overwrite: body.overwrite,
      generatedRows: data.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        created: data.length,
        overwrite: body.overwrite,
      },
    });
  } catch (error) {
    console.error("[OPS] Error generating pauta mensual:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar la pauta mensual" },
      { status: 500 }
    );
  }
}
