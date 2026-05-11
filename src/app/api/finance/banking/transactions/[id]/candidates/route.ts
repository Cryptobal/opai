import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  findDteCandidates,
  findFactoringCandidates,
} from "@/modules/finance/banking/bank-tx-link.service";

/**
 * GET /api/finance/banking/transactions/[id]/candidates
 * Devuelve DTEs candidatos + operaciones de factoring candidatas para
 * conciliar con un movimiento bancario.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const [dtes, factoring] = await Promise.all([
      findDteCandidates(ctx.tenantId, id),
      findFactoringCandidates(ctx.tenantId, id),
    ]);
    return NextResponse.json({
      success: true,
      data: dtes,
      factoring,
    });
  } catch (error) {
    console.error("[Finance/Banking/Candidates] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar candidatos" },
      { status: 500 }
    );
  }
}
