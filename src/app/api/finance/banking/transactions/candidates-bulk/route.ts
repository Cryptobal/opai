import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { findDteCandidatesForBulk } from "@/modules/finance/banking/bank-tx-link.service";

/**
 * POST /api/finance/banking/transactions/candidates-bulk
 * Body: { bankTxIds: string[] }
 * Devuelve DTEs candidatos para conciliar contra la SUMA de los
 * movimientos seleccionados. Pensado para el sheet de conciliación
 * cuando hay 2+ tx marcadas.
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
    const dtes = await findDteCandidatesForBulk(
      ctx.tenantId,
      ids as string[],
    );
    return NextResponse.json({
      success: true,
      data: dtes,
      factoring: [],
    });
  } catch (error) {
    console.error("[Finance/Banking/CandidatesBulk] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar candidatos bulk" },
      { status: 500 },
    );
  }
}
