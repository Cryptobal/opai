import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getControlNocturnoKpis, getControlNocturnoSnapshot } from "@/lib/control-nocturno-kpis";

/**
 * GET /api/ops/control-nocturno/kpis
 *
 * Returns aggregated KPI data for control nocturno reports.
 * Query params:
 *   - dateFrom (YYYY-MM-DD) — defaults to 30 days ago
 *   - dateTo   (YYYY-MM-DD) — defaults to today
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const dateFrom = sp.get("dateFrom")
      ? new Date(sp.get("dateFrom")! + "T00:00:00")
      : defaultFrom;
    const dateTo = sp.get("dateTo")
      ? new Date(sp.get("dateTo")! + "T23:59:59")
      : now;

    const [rangeData, snapshot] = await Promise.all([
      getControlNocturnoKpis(ctx.tenantId, dateFrom, dateTo),
      getControlNocturnoSnapshot(ctx.tenantId, dateTo),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...rangeData,
        snapshot,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching control nocturno KPIs:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los KPIs" },
      { status: 500 },
    );
  }
}

