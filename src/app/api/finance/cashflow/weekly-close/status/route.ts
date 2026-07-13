import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listWeekCloseStatus } from "@/modules/finance/cashflow/weekly-close.service";

/**
 * GET /api/finance/cashflow/weekly-close/status?sinceWeeks=12
 *
 * Secuencia de semanas (desde el cierre más antiguo o `sinceWeeks` atrás hasta
 * la semana en curso) con su estado de cierre. Alimenta el panel "Semanas por
 * cerrar", que revela los huecos (semanas pasadas sin cierre).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const rawSince = Number(sp.get("sinceWeeks"));
  const sinceWeeks =
    Number.isFinite(rawSince) && rawSince > 0 ? Math.min(rawSince, 104) : 12;

  const weeks = await listWeekCloseStatus(ctx.tenantId, sinceWeeks);
  return NextResponse.json({
    success: true,
    data: weeks.map((w) => ({
      weekStartDate: w.weekStartDate.toISOString(),
      weekEndDate: w.weekEndDate.toISOString(),
      label: w.label,
      state: w.state,
      isAnchor: w.isAnchor,
      isManual: w.isManual,
      bankBalanceClp: w.bankBalanceClp,
      varianceClp: w.varianceClp,
      varianceResolution: w.varianceResolution,
    })),
  });
}
