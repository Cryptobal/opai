import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess, parseDateOnly } from "@/lib/ops";

const eliminarSerieSchema = z.object({
  puestoId: z.string().uuid(),
  slotNumber: z.number().int().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["from_forward", "single_day"]),
});

/**
 * POST /api/ops/pauta-mensual/eliminar-serie
 * Elimina la serie pintada: desde una fecha hacia adelante o solo un día.
 * No borra filas de asistencia_diaria (solo actualiza pauta).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, eliminarSerieSchema);
    if (parsed.error) return parsed.error;
    const { puestoId, slotNumber, date, mode } = parsed.data;

    const fromDate = parseDateOnly(date);

    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: { id: puestoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    if (mode === "single_day") {
      await prisma.opsPautaMensual.updateMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId,
          slotNumber,
          date: fromDate,
        },
        data: {
          shiftCode: "-",
          plannedGuardiaId: null,
        },
      });
      await createOpsAuditLog(
        ctx,
        "ops.pauta.eliminar_dia",
        "ops_pauta_mensual",
        puestoId,
        { slotNumber, date, mode: "single_day" }
      );
      return NextResponse.json({
        success: true,
        message: "Día eliminado de la serie",
      });
    }

    // from_forward: quitar serie desde esa fecha en adelante
    const deactivatedSeries = await prisma.opsSerieAsignacion.updateMany({
      where: {
        tenantId: ctx.tenantId,
        puestoId,
        slotNumber,
        isActive: true,
      },
      data: {
        isActive: false,
        endDate: fromDate,
      },
    });

    const result = await prisma.opsPautaMensual.updateMany({
      where: {
        tenantId: ctx.tenantId,
        puestoId,
        slotNumber,
        date: { gte: fromDate },
      },
      data: {
        shiftCode: null,
        plannedGuardiaId: null,
      },
    });

    await createOpsAuditLog(
      ctx,
      "ops.pauta.eliminar_serie",
      "ops_pauta_mensual",
      puestoId,
      {
        slotNumber,
        date,
        mode: "from_forward",
        count: result.count,
        deactivatedSeries: deactivatedSeries.count,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Serie eliminada desde esa fecha en adelante",
      count: result.count,
      deactivatedSeries: deactivatedSeries.count,
    });
  } catch (error) {
    console.error("[OPS] Error eliminar-serie:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la serie" },
      { status: 500 }
    );
  }
}
