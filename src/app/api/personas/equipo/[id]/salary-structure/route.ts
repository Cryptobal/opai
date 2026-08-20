/**
 * GET/POST/PATCH/DELETE /api/personas/equipo/[id]/salary-structure
 * Estructura de sueldo sourceType = PERSONA (equipo interno).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { resolvePersonaSalaryStructure } from "@/lib/payroll/resolve-salary";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canViewSensitiveSalary, redactResolvedSalary } from "@/lib/salary-privacy";
import { staffSalaryStructureSchema } from "@/lib/validations/personas-equipo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadStaff(tenantId: string, id: string) {
  return prisma.opsPersona.findFirst({
    where: { id, tenantId, laborClass: "ADMINISTRATIVO" },
    select: { id: true, salaryStructureId: true },
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const persona = await loadStaff(ctx.tenantId, id);
    if (!persona) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }

    const resolved = await resolvePersonaSalaryStructure(id);
    const canSeeSensitive = canViewSensitiveSalary(await getPermissionsFromAuth(ctx));
    return NextResponse.json({ data: redactResolvedSalary(resolved, canSeeSensitive) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[GET staff salary-structure]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const persona = await loadStaff(ctx.tenantId, id);
    if (!persona) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }
    if (persona.salaryStructureId) {
      return NextResponse.json(
        { error: "Ya tiene sueldo. Usa PATCH para actualizar." },
        { status: 409 },
      );
    }

    const parsed = staffSalaryStructureSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const structure = await prisma.payrollSalaryStructure.create({
      data: {
        tenantId: ctx.tenantId,
        sourceType: "PERSONA",
        sourceId: id,
        baseSalary: body.baseSalary,
        colacion: body.colacion ?? 0,
        movilizacion: body.movilizacion ?? 0,
        gratificationType: body.gratificationType ?? "AUTO_25",
        gratificationCustomAmount: body.gratificationCustomAmount ?? null,
        isActive: true,
        effectiveFrom: body.effectiveFrom ? new Date(`${body.effectiveFrom}T00:00:00.000Z`) : new Date(),
        effectiveUntil: body.effectiveUntil ? new Date(`${body.effectiveUntil}T00:00:00.000Z`) : null,
        createdBy: ctx.userId,
      },
    });

    await prisma.opsPersona.update({
      where: { id },
      data: { salaryStructureId: structure.id },
    });

    await createOpsAuditLog(ctx, "create", "ops_persona_salary", id, {
      structureId: structure.id,
    });

    const resolved = await resolvePersonaSalaryStructure(id);
    return NextResponse.json({ data: resolved }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[POST staff salary-structure]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const persona = await loadStaff(ctx.tenantId, id);
    if (!persona?.salaryStructureId) {
      return NextResponse.json({ error: "No existe sueldo para esta persona" }, { status: 404 });
    }

    const parsed = staffSalaryStructureSchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (body.baseSalary !== undefined) updateData.baseSalary = body.baseSalary;
    if (body.colacion !== undefined) updateData.colacion = body.colacion;
    if (body.movilizacion !== undefined) updateData.movilizacion = body.movilizacion;
    if (body.gratificationType !== undefined) updateData.gratificationType = body.gratificationType;
    if (body.gratificationCustomAmount !== undefined) {
      updateData.gratificationCustomAmount = body.gratificationCustomAmount;
    }
    if (body.effectiveFrom !== undefined) {
      updateData.effectiveFrom = body.effectiveFrom
        ? new Date(`${body.effectiveFrom}T00:00:00.000Z`)
        : null;
    }
    if (body.effectiveUntil !== undefined) {
      updateData.effectiveUntil = body.effectiveUntil
        ? new Date(`${body.effectiveUntil}T00:00:00.000Z`)
        : null;
      if (body.effectiveUntil) {
        const until = new Date(`${body.effectiveUntil}T23:59:59.000Z`);
        if (until <= new Date()) updateData.isActive = false;
      }
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    await prisma.payrollSalaryStructure.update({
      where: { id: persona.salaryStructureId },
      data: updateData,
    });

    await createOpsAuditLog(ctx, "update", "ops_persona_salary", id, {
      structureId: persona.salaryStructureId,
    });

    const resolved = await resolvePersonaSalaryStructure(id);
    return NextResponse.json({ data: resolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[PATCH staff salary-structure]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const persona = await loadStaff(ctx.tenantId, id);
    if (!persona?.salaryStructureId) {
      return NextResponse.json({ error: "No existe sueldo para esta persona" }, { status: 404 });
    }

    await prisma.opsPersona.update({
      where: { id },
      data: { salaryStructureId: null },
    });
    await prisma.payrollSalaryStructureBono.deleteMany({
      where: { salaryStructureId: persona.salaryStructureId },
    });
    await prisma.payrollSalaryStructure.delete({
      where: { id: persona.salaryStructureId },
    });

    await createOpsAuditLog(ctx, "delete", "ops_persona_salary", id, {});

    const resolved = await resolvePersonaSalaryStructure(id);
    return NextResponse.json({ data: resolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[DELETE staff salary-structure]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
