/**
 * GET/PATCH/DELETE /api/payroll/bonos/[id]
 * Operaciones sobre un bono individual del catálogo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const bono = await prisma.payrollBonoCatalog.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!bono) {
      return NextResponse.json({ error: "Bono no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: bono });
  } catch (err: any) {
    console.error("[GET /api/payroll/bonos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.payrollBonoCatalog.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bono no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.bonoType !== undefined) {
      if (!["FIJO", "PORCENTUAL", "CONDICIONAL"].includes(body.bonoType)) {
        return NextResponse.json(
          { error: "bonoType debe ser FIJO, PORCENTUAL o CONDICIONAL" },
          { status: 400 }
        );
      }
      updateData.bonoType = body.bonoType;
    }
    if (body.isTaxable !== undefined) updateData.isTaxable = body.isTaxable;
    if (body.isTributable !== undefined) updateData.isTributable = body.isTributable;
    if (body.defaultAmount !== undefined) updateData.defaultAmount = body.defaultAmount;
    if (body.defaultPercentage !== undefined) updateData.defaultPercentage = body.defaultPercentage;
    if (body.conditionType !== undefined) updateData.conditionType = body.conditionType;
    if (body.conditionThreshold !== undefined) updateData.conditionThreshold = body.conditionThreshold;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updated = await prisma.payrollBonoCatalog.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/bonos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const existing = await prisma.payrollBonoCatalog.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bono no encontrado" }, { status: 404 });
    }

    // Check if bono is used in any salary structure
    const usageCount = await prisma.payrollSalaryStructureBono.count({
      where: { bonoCatalogId: id },
    });

    if (usageCount > 0) {
      // Soft-delete: just deactivate
      await prisma.payrollBonoCatalog.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        data: { deactivated: true },
        message: `Bono desactivado (está en uso en ${usageCount} estructura(s) de sueldo)`,
      });
    }

    await prisma.payrollBonoCatalog.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error("[DELETE /api/payroll/bonos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
