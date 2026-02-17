/**
 * GET/POST /api/payroll/bonos
 * CRUD catálogo de bonos configurables para payroll
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

    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get("active") !== "false";

    const bonos = await prisma.payrollBonoCatalog.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: bonos });
  } catch (err: any) {
    console.error("[GET /api/payroll/bonos]", err);
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
    const { code, name, description, bonoType, isTaxable, isTributable, defaultAmount, defaultPercentage, conditionType, conditionThreshold } = body;

    if (!code || !name || !bonoType) {
      return NextResponse.json(
        { error: "Campos requeridos: code, name, bonoType" },
        { status: 400 }
      );
    }

    if (!["FIJO", "PORCENTUAL", "CONDICIONAL"].includes(bonoType)) {
      return NextResponse.json(
        { error: "bonoType debe ser FIJO, PORCENTUAL o CONDICIONAL" },
        { status: 400 }
      );
    }

    const existing = await prisma.payrollBonoCatalog.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: `Ya existe un bono con el código "${code}"` },
        { status: 409 }
      );
    }

    const bono = await prisma.payrollBonoCatalog.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        name,
        description: description || null,
        bonoType,
        isTaxable: isTaxable ?? true,
        isTributable: isTributable ?? true,
        defaultAmount: defaultAmount != null ? defaultAmount : null,
        defaultPercentage: defaultPercentage != null ? defaultPercentage : null,
        conditionType: conditionType || null,
        conditionThreshold: conditionThreshold != null ? conditionThreshold : null,
      },
    });

    return NextResponse.json({ data: bono }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/payroll/bonos]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
