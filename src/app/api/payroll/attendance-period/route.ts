/**
 * GET  /api/payroll/attendance-period?year=&month=
 * POST /api/payroll/attendance-period/reopen  (reopen a closed period)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const modCheck = await requireTenantModule('payroll');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureModuleAccess(ctx, "payroll");
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Parámetros year y month requeridos" },
        { status: 400 },
      );
    }

    const record = await prisma.payrollAttendancePeriod.findUnique({
      where: {
        tenantId_year_month: {
          tenantId: ctx.tenantId,
          year,
          month,
        },
      },
    });

    if (!record) {
      return NextResponse.json({
        data: { status: "open", year, month, summary: null },
      });
    }

    let lockedByName: string | null = null;
    if (record.lockedBy) {
      const admin = await prisma.admin.findUnique({
        where: { id: record.lockedBy },
        select: { name: true, email: true },
      });
      lockedByName = admin?.name ?? admin?.email ?? record.lockedBy;
    }

    return NextResponse.json({
      data: { ...record, lockedByName },
    });
  } catch (err: any) {
    console.error("[GET /api/payroll/attendance-period]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const modCheck = await requireTenantModule('payroll');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureModuleAccess(ctx, "payroll");
    if (forbidden) return forbidden;

    if (ctx.userRole !== "admin") {
      return NextResponse.json(
        { error: "Solo administradores pueden reabrir períodos" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { year, month } = body;

    if (!year || !month) {
      return NextResponse.json(
        { error: "Parámetros year y month requeridos" },
        { status: 400 },
      );
    }

    const record = await prisma.payrollAttendancePeriod.findUnique({
      where: {
        tenantId_year_month: {
          tenantId: ctx.tenantId,
          year: Number(year),
          month: Number(month),
        },
      },
    });

    if (!record) {
      return NextResponse.json(
        { error: "Período no encontrado" },
        { status: 404 },
      );
    }

    const updated = await prisma.payrollAttendancePeriod.update({
      where: { id: record.id },
      data: {
        status: "open",
        lockedAt: null,
        lockedBy: null,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/attendance-period]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
