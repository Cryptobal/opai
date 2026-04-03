/**
 * GET /api/portal/guardia/liquidaciones
 * Returns liquidaciones for the authenticated guard (portal).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionData = cookieStore.get("guard_session")?.value;
    if (!sessionData) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let session: { guardiaId: string; tenantId: string };
    try {
      session = JSON.parse(sessionData);
    } catch {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }

    const guardAuth = await requirePortalGuardiaAuth(session.guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const liquidaciones = await prisma.payrollLiquidacion.findMany({
      where: {
        guardiaId: guardAuth.guardiaId,
        tenantId: guardAuth.tenantId,
        status: { in: ["APPROVED", "PAID"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        daysWorked: true,
        grossSalary: true,
        netSalary: true,
        totalDeductions: true,
        salarySource: true,
        status: true,
        breakdown: true,
        createdAt: true,
        period: { select: { year: true, month: true } },
      },
    });

    return NextResponse.json({ data: liquidaciones });
  } catch (err: any) {
    console.error("[GET /api/portal/guardia/liquidaciones]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
