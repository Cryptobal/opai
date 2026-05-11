import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { findCashflowOccurrenceCandidates } from "@/modules/finance/cashflow/candidate-finder";

/**
 * GET /api/finance/banking/transactions/[id]/cashflow-candidates
 * Devuelve occurrences proyectadas candidatas para conciliar con un mov bancario.
 * Query params opcionales: weeksBack, weeksForward, amountTolerance, limit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const sp = new URL(request.url).searchParams;
    const candidates = await findCashflowOccurrenceCandidates(ctx.tenantId, id, {
      weeksBack: sp.get("weeksBack") ? Number(sp.get("weeksBack")) : undefined,
      weeksForward: sp.get("weeksForward") ? Number(sp.get("weeksForward")) : undefined,
      amountTolerance: sp.get("amountTolerance") ? Number(sp.get("amountTolerance")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ success: true, data: candidates });
  } catch (error) {
    console.error("[Finance/Banking/CashflowCandidates] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
