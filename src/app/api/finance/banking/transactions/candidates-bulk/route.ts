import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  findDteCandidatesForBulk,
  findFactoringCandidatesForBulk,
  findFactoringBatchesForBankTxs,
} from "@/modules/finance/banking/bank-tx-link.service";

/**
 * POST /api/finance/banking/transactions/candidates-bulk
 * Body: { bankTxIds: string[] }
 * Devuelve DTEs Y cesiones a factoring candidatas (+ lotes) para conciliar
 * contra la SUMA de los movimientos seleccionados.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.bankTxIds;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      return NextResponse.json(
        { success: false, error: "bankTxIds debe ser string[]" },
        { status: 400 },
      );
    }
    const bankTxIds = ids as string[];
    const [dtes, factoring, factoringBatches] = await Promise.all([
      findDteCandidatesForBulk(ctx.tenantId, bankTxIds),
      findFactoringCandidatesForBulk(ctx.tenantId, bankTxIds),
      findFactoringBatchesForBankTxs(ctx.tenantId, bankTxIds),
    ]);
    return NextResponse.json({
      success: true,
      data: dtes,
      factoring,
      factoringBatches,
    });
  } catch (error) {
    console.error("[Finance/Banking/CandidatesBulk] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar candidatos bulk" },
      { status: 500 },
    );
  }
}
