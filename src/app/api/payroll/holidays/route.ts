/**
 * GET/POST /api/payroll/holidays
 * CRUD for Chilean holidays (feriados)
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

    const year = req.nextUrl.searchParams.get("year");

    const holidays = await prisma.payrollHoliday.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(year ? { year: parseInt(year, 10) } : {}),
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ data: holidays });
  } catch (err: any) {
    console.error("[GET /api/payroll/holidays]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const body = await req.json();
    const { date, name, type } = body;

    if (!date || !name) {
      return NextResponse.json({ error: "date y name son requeridos" }, { status: 400 });
    }

    const dateObj = new Date(`${date}T00:00:00.000Z`);
    const year = dateObj.getUTCFullYear();

    const holiday = await prisma.payrollHoliday.create({
      data: {
        tenantId: ctx.tenantId,
        date: dateObj,
        name,
        type: type || "normal",
        year,
      },
    });

    return NextResponse.json({ data: holiday }, { status: 201 });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un feriado para esa fecha" }, { status: 409 });
    }
    console.error("[POST /api/payroll/holidays]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
