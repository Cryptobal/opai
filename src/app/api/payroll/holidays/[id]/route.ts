/**
 * PATCH/DELETE /api/payroll/holidays/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.payrollHoliday.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Feriado no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.date !== undefined) {
      const dateObj = new Date(`${body.date}T00:00:00.000Z`);
      updateData.date = dateObj;
      updateData.year = dateObj.getUTCFullYear();
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updated = await prisma.payrollHoliday.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/holidays/[id]]", err);
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

    const existing = await prisma.payrollHoliday.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Feriado no encontrado" }, { status: 404 });
    }

    await prisma.payrollHoliday.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error("[DELETE /api/payroll/holidays/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
