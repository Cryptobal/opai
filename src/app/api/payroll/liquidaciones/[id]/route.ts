/**
 * GET /api/payroll/liquidaciones/[id]
 * Get individual liquidacion detail with full breakdown
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const modCheck = await requireTenantModule('payroll');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const liquidacion = await prisma.payrollLiquidacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!liquidacion) {
      return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data: liquidacion });
  } catch (err: any) {
    console.error("[GET /api/payroll/liquidaciones/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
