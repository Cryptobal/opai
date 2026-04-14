/**
 * GET  /api/payroll/fx  — get latest UF and UTM values
 * POST /api/payroll/fx  — upsert a UF or UTM value (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const modCheck = await requireTenantModule("payroll");
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureModuleAccess(ctx, "payroll");
    if (forbidden) return forbidden;

    const ufRates = await prisma.fxUfRate.findMany({
      orderBy: { date: "desc" },
      take: 12,
    });

    const utmRates = await prisma.fxUtmRate.findMany({
      orderBy: { month: "desc" },
      take: 12,
    });

    return NextResponse.json({
      data: {
        uf: ufRates.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          value: Number(r.value),
          source: r.source,
          fetchedAt: r.fetchedAt.toISOString(),
        })),
        utm: utmRates.map((r) => ({
          month: r.month.toISOString().slice(0, 7),
          value: Number(r.value),
          source: r.source,
          fetchedAt: r.fetchedAt.toISOString(),
        })),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/payroll/fx]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const modCheck = await requireTenantModule("payroll");
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureModuleAccess(ctx, "payroll");
    if (forbidden) return forbidden;

    if (ctx.userRole !== "admin") {
      return NextResponse.json(
        { error: "Solo administradores pueden actualizar valores UF/UTM" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { type, date, value, source } = body;

    if (!type || !date || !value) {
      return NextResponse.json(
        { error: "type (uf|utm), date (YYYY-MM-DD) y value son requeridos" },
        { status: 400 }
      );
    }

    if (type === "uf") {
      const dateObj = new Date(`${date}T12:00:00Z`);
      const record = await prisma.fxUfRate.upsert({
        where: { date: dateObj },
        update: { value, source: source ?? "MANUAL", fetchedAt: new Date() },
        create: { date: dateObj, value, source: source ?? "MANUAL", fetchedAt: new Date() },
      });
      return NextResponse.json({
        data: { date: record.date.toISOString().slice(0, 10), value: Number(record.value) },
      });
    }

    if (type === "utm") {
      const [year, month] = date.split("-").map(Number);
      const monthObj = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
      const record = await prisma.fxUtmRate.upsert({
        where: { month: monthObj },
        update: { value, source: source ?? "MANUAL", fetchedAt: new Date() },
        create: { month: monthObj, value, source: source ?? "MANUAL", fetchedAt: new Date() },
      });
      return NextResponse.json({
        data: { month: record.month.toISOString().slice(0, 7), value: Number(record.value) },
      });
    }

    return NextResponse.json({ error: "type debe ser 'uf' o 'utm'" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/payroll/fx]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
