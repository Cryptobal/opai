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
    const forbidden = await ensureOpsAccess(ctx);
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

    // If deactivating: block if there are active guard assignments
    if (body.active === false && existing.active === true) {
      const activeAssignments = await prisma.opsAsignacionGuardia.findMany({
        where: { puestoId: id, tenantId: ctx.tenantId, isActive: true },
        select: {
          slotNumber: true,
          guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
        },
      });

      if (activeAssignments.length > 0) {
        const names = activeAssignments
          .map((a) => `${a.guardia.persona.firstName} ${a.guardia.persona.lastName} (Slot ${a.slotNumber})`)
          .join(", ");
        return NextResponse.json(
          {
            success: false,
            error: `No se puede desactivar: tiene ${activeAssignments.length} guardia(s) asignado(s): ${names}. Desasígnalos primero desde la sección Dotación activa.`,
          },
          { status: 400 }
        );
      }

      const deactivateDate = body.activeUntil
        ? parseDateOnly(body.activeUntil as string)
        : parseDateOnly(toISODate(new Date()));

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

    // Normal update (no status change). Build data with only defined fields; convert date strings to Date for Prisma.
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.puestoTrabajoId !== undefined) data.puestoTrabajoId = body.puestoTrabajoId;
    if (body.cargoId !== undefined) data.cargoId = body.cargoId;
    if (body.rolId !== undefined) data.rolId = body.rolId;
    if (body.shiftStart !== undefined) data.shiftStart = body.shiftStart;
    if (body.shiftEnd !== undefined) data.shiftEnd = body.shiftEnd;
    if (body.weekdays !== undefined) data.weekdays = body.weekdays;
    if (body.requiredGuards !== undefined) data.requiredGuards = body.requiredGuards;
    if (body.baseSalary !== undefined) data.baseSalary = body.baseSalary;
    if (body.teMontoClp !== undefined) data.teMontoClp = body.teMontoClp;
    if (typeof body.activeFrom === "string" && body.activeFrom) data.activeFrom = parseDateOnly(body.activeFrom);
    else if (body.activeFrom === null) data.activeFrom = null;
    if (typeof body.activeUntil === "string" && body.activeUntil) data.activeUntil = parseDateOnly(body.activeUntil);
    else if (body.activeUntil === null) data.activeUntil = null;
    const updated = await prisma.opsPuestoOperativo.update({
      where: { id },
      data: data as Parameters<typeof prisma.opsPuestoOperativo.update>[0]["data"],
    });

    // Update or create salary structure if salary-related fields are present
    const hasSalaryFields = body.baseSalary !== undefined || body.colacion !== undefined ||
      body.movilizacion !== undefined || body.gratificationType !== undefined ||
      body.bonos !== undefined;

    if (hasSalaryFields && body.baseSalary != null && body.baseSalary > 0) {
      const fullPuesto = await prisma.opsPuestoOperativo.findUnique({
        where: { id },
        select: { salaryStructureId: true, tenantId: true },
      });

      if (fullPuesto?.salaryStructureId) {
        // Update existing salary structure
        await prisma.payrollSalaryStructure.update({
          where: { id: fullPuesto.salaryStructureId },
          data: {
            baseSalary: body.baseSalary ?? undefined,
            colacion: body.colacion ?? undefined,
            movilizacion: body.movilizacion ?? undefined,
            gratificationType: body.gratificationType ?? undefined,
            gratificationCustomAmount: body.gratificationCustomAmount ?? undefined,
          },
        });

        // Replace bonos if provided
        if (Array.isArray(body.bonos)) {
          await prisma.payrollSalaryStructureBono.deleteMany({
            where: { salaryStructureId: fullPuesto.salaryStructureId },
          });
          if (body.bonos.length > 0) {
            await prisma.payrollSalaryStructureBono.createMany({
              data: body.bonos
                .filter((b: any) => b.bonoCatalogId)
                .map((b: any) => ({
                  salaryStructureId: fullPuesto.salaryStructureId!,
                  bonoCatalogId: b.bonoCatalogId,
                  overrideAmount: b.overrideAmount ?? null,
                  overridePercentage: b.overridePercentage ?? null,
                  isActive: true,
                })),
            });
          }
        }
      } else {
        // Create new salary structure
        const salaryStructure = await prisma.payrollSalaryStructure.create({
          data: {
            tenantId: ctx.tenantId,
            sourceType: "PUESTO",
            sourceId: id,
            baseSalary: body.baseSalary,
            colacion: body.colacion ?? 0,
            movilizacion: body.movilizacion ?? 0,
            gratificationType: body.gratificationType ?? "AUTO_25",
            gratificationCustomAmount: body.gratificationCustomAmount ?? null,
            isActive: true,
            createdBy: ctx.userId,
          },
        });

        await prisma.opsPuestoOperativo.update({
          where: { id },
          data: { salaryStructureId: salaryStructure.id },
        });

        if (Array.isArray(body.bonos) && body.bonos.length > 0) {
          await prisma.payrollSalaryStructureBono.createMany({
            data: body.bonos
              .filter((b: any) => b.bonoCatalogId)
              .map((b: any) => ({
                salaryStructureId: salaryStructure.id,
                bonoCatalogId: b.bonoCatalogId,
                overrideAmount: b.overrideAmount ?? null,
                overridePercentage: b.overridePercentage ?? null,
                isActive: true,
              })),
          });
        }
      }
    }

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
    const forbidden = await ensureOpsAccess(ctx);
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

    // Check if puesto has active guard assignments
    const activeAssignmentCount = await prisma.opsAsignacionGuardia.count({
      where: { puestoId: id, tenantId: ctx.tenantId, isActive: true },
    });

    if (activeAssignmentCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede eliminar: tiene ${activeAssignmentCount} guardia(s) asignado(s). Desasígnalos primero desde la sección Dotación activa.`,
        },
        { status: 400 }
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

    // Also clean up any inactive assignments before deleting
    await prisma.opsAsignacionGuardia.deleteMany({
      where: { puestoId: id, tenantId: ctx.tenantId },
    });

    // Safe to delete (no historical data, no active assignments)
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
