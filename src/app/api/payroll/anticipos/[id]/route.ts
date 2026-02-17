/**
 * GET/PATCH /api/payroll/anticipos/[id]
 * Anticipo process detail and approval
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

    const process = await prisma.payrollAnticipoProcess.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        items: true,
        period: { select: { year: true, month: true } },
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: process });
  } catch (err: any) {
    console.error("[GET /api/payroll/anticipos/[id]]", err);
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

    const existing = await prisma.payrollAnticipoProcess.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    }

    if (body.status === "APPROVED") {
      await prisma.payrollAnticipoProcess.update({
        where: { id },
        data: { status: "APPROVED" },
      });
    } else if (body.status === "PAID") {
      await prisma.payrollAnticipoProcess.update({
        where: { id },
        data: { status: "PAID" },
      });
      await prisma.payrollAnticipoItem.updateMany({
        where: { anticipoProcessId: id },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    const updated = await prisma.payrollAnticipoProcess.findFirst({
      where: { id },
      include: { items: true },
    });

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/anticipos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
