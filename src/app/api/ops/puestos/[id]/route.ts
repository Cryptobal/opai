import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updatePuestoSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";

type Params = { id: string };

type DeleteDiagnostics = {
  activeAssignmentCount: number;
  activeAssignments: Array<{
    slotNumber: number;
    guardiaName: string;
    startDate: string;
  }>;
  pautaSamples: Array<{
    date: string;
    slotNumber: number;
    shiftCode: string | null;
    plannedGuardiaName: string | null;
  }>;
  asistenciaSamples: Array<{
    date: string;
    slotNumber: number;
    attendanceStatus: string;
    plannedGuardiaName: string | null;
    actualGuardiaName: string | null;
    replacementGuardiaName: string | null;
  }>;
  pautaCount: number;
  asistenciaCount: number;
  activeSeriesCount: number;
  firstPautaDate: string | null;
  lastPautaDate: string | null;
  firstAsistenciaDate: string | null;
  lastAsistenciaDate: string | null;
  canDelete: boolean;
};

async function getDeleteDiagnostics(tenantId: string, puestoId: string): Promise<DeleteDiagnostics> {
  const [
    activeAssignments,
    pautaCount,
    asistenciaCount,
    activeSeriesCount,
    firstPauta,
    lastPauta,
    firstAsistencia,
    lastAsistencia,
    pautaSamples,
    asistenciaSamples,
  ] =
    await Promise.all([
      prisma.opsAsignacionGuardia.findMany({
        where: { tenantId, puestoId, isActive: true },
        select: {
          slotNumber: true,
          startDate: true,
          guardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ slotNumber: "asc" }],
      }),
      prisma.opsPautaMensual.count({ where: { tenantId, puestoId } }),
      prisma.opsAsistenciaDiaria.count({ where: { tenantId, puestoId } }),
      prisma.opsSerieAsignacion.count({
        where: { tenantId, puestoId, isActive: true },
      }),
      prisma.opsPautaMensual.findFirst({
        where: { tenantId, puestoId },
        select: { date: true },
        orderBy: { date: "asc" },
      }),
      prisma.opsPautaMensual.findFirst({
        where: { tenantId, puestoId },
        select: { date: true },
        orderBy: { date: "desc" },
      }),
      prisma.opsAsistenciaDiaria.findFirst({
        where: { tenantId, puestoId },
        select: { date: true },
        orderBy: { date: "asc" },
      }),
      prisma.opsAsistenciaDiaria.findFirst({
        where: { tenantId, puestoId },
        select: { date: true },
        orderBy: { date: "desc" },
      }),
      prisma.opsPautaMensual.findMany({
        where: { tenantId, puestoId },
        select: {
          date: true,
          slotNumber: true,
          shiftCode: true,
          plannedGuardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ date: "desc" }, { slotNumber: "asc" }],
        take: 8,
      }),
      prisma.opsAsistenciaDiaria.findMany({
        where: { tenantId, puestoId },
        select: {
          date: true,
          slotNumber: true,
          attendanceStatus: true,
          plannedGuardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
          actualGuardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
          replacementGuardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ date: "desc" }, { slotNumber: "asc" }],
        take: 8,
      }),
    ]);

  const activeAssignmentCount = activeAssignments.length;
  const canDelete =
    activeAssignmentCount === 0 &&
    pautaCount === 0 &&
    asistenciaCount === 0 &&
    activeSeriesCount === 0;

  return {
    activeAssignmentCount,
    activeAssignments: activeAssignments.map((a) => ({
      slotNumber: a.slotNumber,
      guardiaName: `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`,
      startDate: toISODate(a.startDate),
    })),
    pautaSamples: pautaSamples.map((row) => ({
      date: toISODate(row.date),
      slotNumber: row.slotNumber,
      shiftCode: row.shiftCode ?? null,
      plannedGuardiaName: row.plannedGuardia
        ? `${row.plannedGuardia.persona.firstName} ${row.plannedGuardia.persona.lastName}`
        : null,
    })),
    asistenciaSamples: asistenciaSamples.map((row) => ({
      date: toISODate(row.date),
      slotNumber: row.slotNumber,
      attendanceStatus: row.attendanceStatus,
      plannedGuardiaName: row.plannedGuardia
        ? `${row.plannedGuardia.persona.firstName} ${row.plannedGuardia.persona.lastName}`
        : null,
      actualGuardiaName: row.actualGuardia
        ? `${row.actualGuardia.persona.firstName} ${row.actualGuardia.persona.lastName}`
        : null,
      replacementGuardiaName: row.replacementGuardia
        ? `${row.replacementGuardia.persona.firstName} ${row.replacementGuardia.persona.lastName}`
        : null,
    })),
    pautaCount,
    asistenciaCount,
    activeSeriesCount,
    firstPautaDate: firstPauta ? toISODate(firstPauta.date) : null,
    lastPautaDate: lastPauta ? toISODate(lastPauta.date) : null,
    firstAsistenciaDate: firstAsistencia ? toISODate(firstAsistencia.date) : null,
    lastAsistenciaDate: lastAsistencia ? toISODate(lastAsistencia.date) : null,
    canDelete,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        installationId: true,
        active: true,
        requiredGuards: true,
      },
    });
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    const diagnostics = await getDeleteDiagnostics(ctx.tenantId, id);
    return NextResponse.json({
      success: true,
      data: {
        puesto,
        diagnostics,
      },
    });
  } catch (error) {
    console.error("[OPS] Error getting puesto diagnostics:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el diagnóstico del puesto" },
      { status: 500 }
    );
  }
}

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

    let salaryStructureId: string | null = null;

    if (hasSalaryFields && body.baseSalary != null && body.baseSalary > 0) {
      const fullPuesto = await prisma.opsPuestoOperativo.findUnique({
        where: { id },
        select: { salaryStructureId: true, tenantId: true },
      });

      if (fullPuesto?.salaryStructureId) {
        salaryStructureId = fullPuesto.salaryStructureId;
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

        salaryStructureId = salaryStructure.id;

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

    // Calcular y persistir líquido estimado para que aparezca en la tabla de puestos
    if (salaryStructureId && body.baseSalary != null && body.baseSalary > 0) {
      try {
        const baseSalary = Number(body.baseSalary);
        const colacion = Number(body.colacion ?? 0);
        const movilizacion = Number(body.movilizacion ?? 0);
        const gratificationType = (body.gratificationType as string) ?? "AUTO_25";
        const gratificationCustomAmount = Number(body.gratificationCustomAmount ?? 0);

        let bonosImponibles = 0;
        let bonosNoImponibles = 0;
        const bonos = Array.isArray(body.bonos) ? body.bonos : [];
        if (bonos.length > 0) {
          const bonoIds = bonos.map((b: any) => b.bonoCatalogId).filter(Boolean);
          const catalog = await prisma.payrollBonoCatalog.findMany({
            where: { id: { in: bonoIds }, tenantId: ctx.tenantId },
            select: { id: true, bonoType: true, isTaxable: true, defaultAmount: true, defaultPercentage: true },
          });
          for (const b of bonos) {
            const cat = catalog.find((c) => c.id === b.bonoCatalogId);
            if (!cat) continue;
            let amt = 0;
            if (cat.bonoType === "FIJO") amt = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
            else if (cat.bonoType === "PORCENTUAL") {
              const pct = Number(b.overridePercentage ?? cat.defaultPercentage ?? 0);
              amt = Math.round(baseSalary * pct / 100);
            } else if (cat.bonoType === "CONDICIONAL") amt = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
            if (cat.isTaxable) bonosImponibles += amt;
            else bonosNoImponibles += amt;
          }
        }

        const result = await simulatePayslip({
          base_salary_clp: baseSalary,
          gratification_clp: gratificationType === "CUSTOM" ? gratificationCustomAmount : undefined,
          other_taxable_allowances: bonosImponibles,
          non_taxable_allowances: { transport: movilizacion, meal: colacion, other: bonosNoImponibles },
          contract_type: "indefinite",
          afp_name: "Modelo",
          health_system: "fonasa",
          save_simulation: false,
        });

        await prisma.payrollSalaryStructure.update({
          where: { id: salaryStructureId },
          data: { netSalaryEstimate: result.net_salary },
        });
      } catch (err) {
        console.error("[OPS] Error computing netSalaryEstimate for puesto:", err);
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
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const forceDelete = request.nextUrl.searchParams.get("force") === "true";

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

    const diagnostics = await getDeleteDiagnostics(ctx.tenantId, id);
    if (!diagnostics.canDelete && !forceDelete) {
      const reasons: string[] = [];
      if (diagnostics.activeAssignmentCount > 0) {
        reasons.push(`${diagnostics.activeAssignmentCount} guardia(s) activo(s)`);
      }
      if (diagnostics.pautaCount > 0) {
        reasons.push(`${diagnostics.pautaCount} registro(s) de pauta`);
      }
      if (diagnostics.asistenciaCount > 0) {
        reasons.push(`${diagnostics.asistenciaCount} registro(s) de asistencia`);
      }
      if (diagnostics.activeSeriesCount > 0) {
        reasons.push(`${diagnostics.activeSeriesCount} serie(s) activa(s)`);
      }
      return NextResponse.json(
        {
          success: false,
          error: `No se puede eliminar este puesto porque tiene ${reasons.join(", ")}. Puedes desactivarlo, o eliminar forzadamente si eres administrador.`,
          details: diagnostics,
        },
        { status: 400 }
      );
    }

    if (forceDelete && !["owner", "admin"].includes(ctx.userRole)) {
      return NextResponse.json(
        {
          success: false,
          error: "Solo administradores pueden eliminar forzadamente un puesto con historial.",
          details: diagnostics,
        },
        { status: 403 }
      );
    }

    const affectedGuardias = await prisma.opsAsignacionGuardia.findMany({
      where: { puestoId: id, tenantId: ctx.tenantId },
      select: { guardiaId: true },
    });
    const affectedGuardiaIds = [...new Set(affectedGuardias.map((a) => a.guardiaId))];

    await prisma.$transaction(async (tx) => {
      await tx.opsPuestoOperativo.delete({ where: { id } });

      for (const guardiaId of affectedGuardiaIds) {
        const nextActive = await tx.opsAsignacionGuardia.findFirst({
          where: {
            tenantId: ctx.tenantId,
            guardiaId,
            isActive: true,
          },
          select: { installationId: true },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        });

        await tx.opsGuardia.update({
          where: { id: guardiaId },
          data: { currentInstallationId: nextActive?.installationId ?? null },
        });
      }
    });

    await createOpsAuditLog(ctx, forceDelete ? "ops.puesto.deleted_force" : "ops.puesto.deleted", "ops_puesto", id, {
      diagnostics,
      affectedGuardias: affectedGuardiaIds.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        forceDelete,
        affectedGuardias: affectedGuardiaIds.length,
      },
    });
  } catch (error) {
    console.error("[OPS] Error deleting puesto:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el puesto" },
      { status: 500 }
    );
  }
}
