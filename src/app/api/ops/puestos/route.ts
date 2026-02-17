import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createPuestoSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;

    const puestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId ? { installationId } : {}),
      },
      include: {
        installation: {
          select: { id: true, name: true, teMontoClp: true },
        },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: puestos });
  } catch (error) {
    console.error("[OPS] Error listing puestos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los puestos operativos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createPuestoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: {
        id: true,
        teMontoClp: true,
        isActive: true,
        account: { select: { type: true, isActive: true } },
      },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }
    if (installation.account?.type !== "client") {
      return NextResponse.json(
        { success: false, error: "Solo puedes crear puestos para cuentas cliente" },
        { status: 400 }
      );
    }
    if (!installation.isActive) {
      return NextResponse.json(
        { success: false, error: "La instalación debe estar activa para crear puestos" },
        { status: 400 }
      );
    }
    if (installation.account?.isActive === false) {
      return NextResponse.json(
        { success: false, error: "La cuenta debe estar activa para crear puestos" },
        { status: 400 }
      );
    }

    const puesto = await prisma.opsPuestoOperativo.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        name: body.name,
        puestoTrabajoId: body.puestoTrabajoId ?? null,
        cargoId: body.cargoId ?? null,
        rolId: body.rolId ?? null,
        shiftStart: body.shiftStart,
        shiftEnd: body.shiftEnd,
        weekdays: body.weekdays,
        requiredGuards: body.requiredGuards,
        baseSalary: body.baseSalary ?? null,
        teMontoClp: body.teMontoClp ?? installation.teMontoClp,
        activeFrom: body.activeFrom ? new Date(`${body.activeFrom}T00:00:00.000Z`) : new Date(),
        active: body.active ?? true,
        createdBy: ctx.userId,
      },
      include: {
        installation: {
          select: { id: true, name: true, teMontoClp: true },
        },
      },
    });

    // Create PayrollSalaryStructure for this puesto
    if (body.baseSalary != null && body.baseSalary > 0) {
      const salaryStructure = await prisma.payrollSalaryStructure.create({
        data: {
          tenantId: ctx.tenantId,
          sourceType: "PUESTO",
          sourceId: puesto.id,
          baseSalary: body.baseSalary,
          colacion: body.colacion ?? 0,
          movilizacion: body.movilizacion ?? 0,
          gratificationType: body.gratificationType ?? "AUTO_25",
          gratificationCustomAmount: body.gratificationCustomAmount ?? null,
          isActive: true,
          effectiveFrom: body.activeFrom ? new Date(`${body.activeFrom}T00:00:00.000Z`) : new Date(),
          createdBy: ctx.userId,
        },
      });

      // Link structure to puesto
      await prisma.opsPuestoOperativo.update({
        where: { id: puesto.id },
        data: { salaryStructureId: salaryStructure.id },
      });

      // Create salary structure bonos
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

      // Calcular y persistir líquido estimado para la tabla de puestos
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
          where: { id: salaryStructure.id },
          data: { netSalaryEstimate: result.net_salary },
        });
      } catch (err) {
        console.error("[OPS] Error computing netSalaryEstimate on create puesto:", err);
      }
    }

    await createOpsAuditLog(ctx, "ops.puesto.created", "ops_puesto", puesto.id, {
      installationId: body.installationId,
      name: body.name,
    });

    return NextResponse.json({ success: true, data: puesto }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating puesto:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el puesto operativo" },
      { status: 500 }
    );
  }
}
