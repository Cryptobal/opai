/**
 * POST /api/payroll/periodos/[id]/run
 * Execute monthly payroll run for a period
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { runMonthlyPayroll } from "@/lib/payroll/run-payroll";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const result = await runMonthlyPayroll({
      periodId: id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      installationId: body.installationId,
      guardiaId: body.guardiaId,
    });

    return NextResponse.json({ data: result });
  } catch (err: any) {
    console.error("[POST /api/payroll/periodos/[id]/run]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
