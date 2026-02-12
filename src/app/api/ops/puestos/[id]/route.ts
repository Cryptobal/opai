import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updatePuestoSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";

type Params = { id: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.opsPuestoOperativo.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, active: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, updatePuestoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // If deactivating: set activeUntil and clean future pauta/assignments
    if (body.active === false && existing.active === true) {
      const deactivateDate = body.activeUntil
        ? parseDateOnly(body.activeUntil as string)
        : parseDateOnly(toISODate(new Date()));

      // Close all active guard assignments for this puesto
      const closedAssignments = await prisma.opsAsignacionGuardia.updateMany({
        where: { puestoId: id, tenantId: ctx.tenantId, isActive: true },
        data: {
          isActive: false,
          endDate: deactivateDate,
          reason: "Puesto desactivado",
        },
      });

      // Clean pauta from deactivateDate forward
      await prisma.opsPautaMensual.updateMany({
        where: {
          puestoId: id,
          tenantId: ctx.tenantId,
          date: { gte: deactivateDate },
        },
        data: { plannedGuardiaId: null, shiftCode: null },
      });

      // Clean future asistencia entries (not locked)
      const orphanedAsist = await prisma.opsAsistenciaDiaria.findMany({
        where: {
          puestoId: id,
          tenantId: ctx.tenantId,
          date: { gte: deactivateDate },
          lockedAt: null,
        },
        select: { id: true },
      });
      if (orphanedAsist.length > 0) {
        const orphanIds = orphanedAsist.map((r) => r.id);
        await prisma.opsTurnoExtra.deleteMany({
          where: { asistenciaId: { in: orphanIds }, status: "pending" },
        });
        await prisma.opsAsistenciaDiaria.deleteMany({
          where: { id: { in: orphanIds } },
        });
      }

      // Deactivate series
      await prisma.opsSerieAsignacion.updateMany({
        where: { puestoId: id, tenantId: ctx.tenantId, isActive: true },
        data: { isActive: false, endDate: deactivateDate },
      });

      const updated = await prisma.opsPuestoOperativo.update({
        where: { id },
        data: {
          ...body,
          active: false,
          activeUntil: deactivateDate,
        },
      });

      await createOpsAuditLog(ctx, "ops.puesto.deactivated", "ops_puesto", id, {
        activeUntil: toISODate(deactivateDate),
        closedAssignments: closedAssignments.count,
      });

      return NextResponse.json({ success: true, data: updated });
    }

    // If activating: set activeFrom if not set
    if (body.active === true && existing.active === false) {
      const activateDate = body.activeFrom
        ? parseDateOnly(body.activeFrom as string)
        : parseDateOnly(toISODate(new Date()));

      const updated = await prisma.opsPuestoOperativo.update({
        where: { id },
        data: {
          ...body,
          active: true,
          activeFrom: activateDate,
          activeUntil: null,
        },
      });

      await createOpsAuditLog(ctx, "ops.puesto.activated", "ops_puesto", id, {
        activeFrom: toISODate(activateDate),
      });

      return NextResponse.json({ success: true, data: updated });
    }

    // Normal update (no status change)
    const updated = await prisma.opsPuestoOperativo.update({
      where: { id },
      data: body,
    });

    await createOpsAuditLog(ctx, "ops.puesto.updated", "ops_puesto", id, body);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS] Error updating puesto:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el puesto" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.opsPuestoOperativo.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    // Check if puesto has historical data
    const [pautaCount, asistenciaCount] = await Promise.all([
      prisma.opsPautaMensual.count({ where: { puestoId: id } }),
      prisma.opsAsistenciaDiaria.count({ where: { puestoId: id } }),
    ]);

    if (pautaCount > 0 || asistenciaCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede eliminar: tiene ${pautaCount} registros de pauta y ${asistenciaCount} de asistencia. Desactívalo en su lugar.`,
        },
        { status: 400 }
      );
    }

    // Safe to delete (no historical data)
    await prisma.opsPuestoOperativo.delete({ where: { id } });
    await createOpsAuditLog(ctx, "ops.puesto.deleted", "ops_puesto", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting puesto:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el puesto" },
      { status: 500 }
    );
  }
}
