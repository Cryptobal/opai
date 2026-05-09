import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  analyzeBankTransactions,
  type AnalysisGroupBy,
  type AnalysisDirection,
} from "@/modules/finance/banking/bank-analysis.service";

/**
 * GET /api/finance/banking/analysis
 * Query params:
 *   - bankAccountId (repetible, opcional)
 *   - dateFrom, dateTo (YYYY-MM-DD)
 *   - direction: income | expense | both (default both)
 *   - groupBy: counterparty | category | month | day (default counterparty)
 *   - topN: número (default 50)
 *   - search: string opcional
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const bankAccountIds = searchParams.getAll("bankAccountId");
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const directionRaw = searchParams.get("direction");
    const direction: AnalysisDirection =
      directionRaw === "income" || directionRaw === "expense"
        ? directionRaw
        : "both";
    const groupByRaw = searchParams.get("groupBy");
    const groupBy: AnalysisGroupBy =
      groupByRaw === "counterparty" ||
      groupByRaw === "category" ||
      groupByRaw === "month" ||
      groupByRaw === "day"
        ? groupByRaw
        : "counterparty";
    const topNRaw = searchParams.get("topN");
    const topN = topNRaw ? Math.max(5, Math.min(200, parseInt(topNRaw))) : 50;
    const search = searchParams.get("search") || undefined;

    const data = await analyzeBankTransactions(ctx.tenantId, {
      bankAccountIds: bankAccountIds.length > 0 ? bankAccountIds : undefined,
      dateFrom,
      dateTo,
      direction,
      groupBy,
      topN,
      search,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Banking/Analysis] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al analizar movimientos" },
      { status: 500 }
    );
  }
}
