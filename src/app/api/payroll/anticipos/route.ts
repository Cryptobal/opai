/**
 * GET/POST /api/payroll/anticipos
 * Manage anticipo (advance payment) processes
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const processes = await prisma.payrollAnticipoProcess.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        period: { select: { year: true, month: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ data: processes });
  } catch (err: any) {
    console.error("[GET /api/payroll/anticipos]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST - Generate anticipo process for a period.
 * Reads all active guards with recibeAnticipo=true and creates items.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { periodId } = await req.json();
    if (!periodId) {
      return NextResponse.json({ error: "periodId requerido" }, { status: 400 });
    }

    const period = await prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId: ctx.tenantId },
    });
    if (!period) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    // Get guards who receive anticipo
    const guards = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "active",
        recibeAnticipo: true,
        montoAnticipo: { gt: 0 },
      },
      select: {
        id: true,
        montoAnticipo: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    if (guards.length === 0) {
      return NextResponse.json(
        { error: "No hay guardias activos con anticipo configurado" },
        { status: 400 }
      );
    }

    const totalAmount = guards.reduce((sum, g) => sum + g.montoAnticipo, 0);

    // Create process with items
    const process = await prisma.payrollAnticipoProcess.create({
      data: {
        tenantId: ctx.tenantId,
        periodId,
        processDate: new Date(),
        status: "DRAFT",
        totalAmount,
        totalGuards: guards.length,
        createdBy: ctx.userId,
        items: {
          create: guards.map((g) => ({
            guardiaId: g.id,
            amount: g.montoAnticipo,
            status: "PENDING",
          })),
        },
      },
      include: {
        items: true,
        period: { select: { year: true, month: true } },
      },
    });

    return NextResponse.json({ data: process }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/payroll/anticipos]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
