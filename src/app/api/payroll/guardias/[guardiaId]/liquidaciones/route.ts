/**
 * GET /api/payroll/guardias/[guardiaId]/liquidaciones
 * Returns liquidaciones for a specific guard.
 * Only returns PAID liquidaciones (visible after period is marked as paid).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ guardiaId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { guardiaId } = await params;

    const liquidaciones = await prisma.payrollLiquidacion.findMany({
      where: {
        guardiaId,
        tenantId: ctx.tenantId,
        status: "PAID",
      },
      orderBy: { createdAt: "desc" },
      include: {
        period: { select: { year: true, month: true } },
      },
    });

    return NextResponse.json({ data: liquidaciones });
  } catch (err: any) {
    console.error("[GET /api/payroll/guardias/[guardiaId]/liquidaciones]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
