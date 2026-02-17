/**
 * GET/POST /api/payroll/periodos
 * Manage payroll periods
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

    const periods = await prisma.payrollPeriod.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        _count: {
          select: { liquidaciones: true, attendanceRecords: true },
        },
      },
    });

    return NextResponse.json({ data: periods });
  } catch (err: any) {
    console.error("[GET /api/payroll/periodos]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { year, month } = await req.json();
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year y month requeridos (month 1-12)" }, { status: 400 });
    }

    // Check if period already exists
    const existing = await prisma.payrollPeriod.findFirst({
      where: { tenantId: ctx.tenantId, year, month },
    });
    if (existing) {
      return NextResponse.json({ error: "Ya existe un período para ese mes/año" }, { status: 409 });
    }

    const period = await prisma.payrollPeriod.create({
      data: {
        tenantId: ctx.tenantId,
        year,
        month,
        status: "OPEN",
      },
    });

    return NextResponse.json({ data: period }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/payroll/periodos]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
