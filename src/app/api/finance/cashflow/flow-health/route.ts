import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  getFlowDestinationChain,
  getFlowHealth,
} from "@/modules/finance/cashflow/flow-health.service";

/**
 * GET /api/finance/cashflow/flow-health
 *   ?accountPlanId=…  → cadena puntual cuenta → categoría → fila
 *   ?flowRowId=…      → cadena puntual fila → categoría → cuenta
 *   (sin params)      → reporte completo de salud
 *
 * Guard: cashflow_configure (misma capability que la config de flujo).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const accountPlanId = searchParams.get("accountPlanId") ?? undefined;
    const flowRowId = searchParams.get("flowRowId") ?? undefined;

    if (accountPlanId || flowRowId) {
      const chain = await getFlowDestinationChain(ctx.tenantId, {
        accountPlanId,
        flowRowId,
      });
      return NextResponse.json({ success: true, data: chain });
    }

    const report = await getFlowHealth(ctx.tenantId);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("[Finance/Cashflow] GET flow-health error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
