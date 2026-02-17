/**
 * GET/POST/PATCH/DELETE /api/personas/guardias/[id]/salary-structure
 * Manage salary structure override (sueldo por RUT) for a guard
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { resolveSalaryStructure } from "@/lib/payroll/resolve-salary";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET - Returns resolved salary (RUT if exists, else from puesto/installation)
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, salaryStructureId: true },
    });
    if (!guardia) {
      return NextResponse.json({ error: "Guardia no encontrado" }, { status: 404 });
    }

    const resolved = await resolveSalaryStructure(id);

    return NextResponse.json({
      data: {
        ...resolved,
        hasRutOverride: guardia.salaryStructureId != null,
      },
    });
  } catch (err: any) {
    console.error("[GET salary-structure]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST - Create RUT salary override for the guard
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, salaryStructureId: true },
    });
    if (!guardia) {
      return NextResponse.json({ error: "Guardia no encontrado" }, { status: 404 });
    }
    if (guardia.salaryStructureId) {
      return NextResponse.json(
        { error: "El guardia ya tiene un sueldo por RUT. Usa PATCH para actualizar." },
        { status: 409 }
      );
    }

    const { baseSalary, colacion, movilizacion, gratificationType, gratificationCustomAmount, bonos } = body;

    if (!baseSalary || baseSalary <= 0) {
      return NextResponse.json({ error: "baseSalary es requerido" }, { status: 400 });
    }

    const structure = await prisma.payrollSalaryStructure.create({
      data: {
        tenantId: ctx.tenantId,
        sourceType: "GUARDIA_RUT",
        sourceId: id,
        baseSalary,
        colacion: colacion ?? 0,
        movilizacion: movilizacion ?? 0,
        gratificationType: gratificationType ?? "AUTO_25",
        gratificationCustomAmount: gratificationCustomAmount ?? null,
        isActive: true,
        effectiveFrom: new Date(),
        createdBy: ctx.userId,
      },
    });

    // Link to guard
    await prisma.opsGuardia.update({
      where: { id },
      data: { salaryStructureId: structure.id },
    });

    // Create bonos
    if (Array.isArray(bonos) && bonos.length > 0) {
      await prisma.payrollSalaryStructureBono.createMany({
        data: bonos
          .filter((b: any) => b.bonoCatalogId)
          .map((b: any) => ({
            salaryStructureId: structure.id,
            bonoCatalogId: b.bonoCatalogId,
            overrideAmount: b.overrideAmount ?? null,
            overridePercentage: b.overridePercentage ?? null,
            isActive: true,
          })),
      });
    }

    const resolved = await resolveSalaryStructure(id);
    return NextResponse.json({ data: { ...resolved, hasRutOverride: true } }, { status: 201 });
  } catch (err: any) {
    console.error("[POST salary-structure]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH - Update existing RUT salary override
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, salaryStructureId: true },
    });
    if (!guardia || !guardia.salaryStructureId) {
      return NextResponse.json({ error: "No existe sueldo por RUT para este guardia" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.baseSalary !== undefined) updateData.baseSalary = body.baseSalary;
    if (body.colacion !== undefined) updateData.colacion = body.colacion;
    if (body.movilizacion !== undefined) updateData.movilizacion = body.movilizacion;
    if (body.gratificationType !== undefined) updateData.gratificationType = body.gratificationType;
    if (body.gratificationCustomAmount !== undefined) updateData.gratificationCustomAmount = body.gratificationCustomAmount;

    await prisma.payrollSalaryStructure.update({
      where: { id: guardia.salaryStructureId },
      data: updateData,
    });

    // Replace bonos if provided
    if (Array.isArray(body.bonos)) {
      await prisma.payrollSalaryStructureBono.deleteMany({
        where: { salaryStructureId: guardia.salaryStructureId },
      });
      if (body.bonos.length > 0) {
        await prisma.payrollSalaryStructureBono.createMany({
          data: body.bonos
            .filter((b: any) => b.bonoCatalogId)
            .map((b: any) => ({
              salaryStructureId: guardia.salaryStructureId!,
              bonoCatalogId: b.bonoCatalogId,
              overrideAmount: b.overrideAmount ?? null,
              overridePercentage: b.overridePercentage ?? null,
              isActive: true,
            })),
        });
      }
    }

    const resolved = await resolveSalaryStructure(id);
    return NextResponse.json({ data: { ...resolved, hasRutOverride: true } });
  } catch (err: any) {
    console.error("[PATCH salary-structure]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE - Remove RUT salary override (guard will inherit from puesto)
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, salaryStructureId: true },
    });
    if (!guardia || !guardia.salaryStructureId) {
      return NextResponse.json({ error: "No existe sueldo por RUT para este guardia" }, { status: 404 });
    }

    // Unlink from guard first
    await prisma.opsGuardia.update({
      where: { id },
      data: { salaryStructureId: null },
    });

    // Delete bonos then structure
    await prisma.payrollSalaryStructureBono.deleteMany({
      where: { salaryStructureId: guardia.salaryStructureId },
    });
    await prisma.payrollSalaryStructure.delete({
      where: { id: guardia.salaryStructureId },
    });

    const resolved = await resolveSalaryStructure(id);
    return NextResponse.json({ data: { ...resolved, hasRutOverride: false } });
  } catch (err: any) {
    console.error("[DELETE salary-structure]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
