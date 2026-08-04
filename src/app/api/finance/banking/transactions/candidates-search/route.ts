import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  searchReconcileCandidates,
  type ReconcileSearchScope,
} from "@/modules/finance/banking/bank-tx-link.service";

const SCOPES = new Set<ReconcileSearchScope>([
  "factoring",
  "ceded",
  "open",
  "all",
]);

/**
 * POST /api/finance/banking/transactions/candidates-search
 * Body: { bankTxIds: string[], query: string, scope?: ..., limit?: number }
 * Búsqueda server-side de candidatos DTE / cesiones (banking_view).
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
    const query: unknown = body?.query;
    const scopeRaw: unknown = body?.scope;
    const limitRaw: unknown = body?.limit;

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string")) {
      return NextResponse.json(
        { success: false, error: "bankTxIds debe ser string[] no vacío" },
        { status: 400 },
      );
    }
    if (typeof query !== "string") {
      return NextResponse.json(
        { success: false, error: "query debe ser string" },
        { status: 400 },
      );
    }
    if (query.trim().length > 80) {
      return NextResponse.json(
        { success: false, error: "query demasiado larga" },
        { status: 400 },
      );
    }

    let scope: ReconcileSearchScope | undefined;
    if (scopeRaw !== undefined && scopeRaw !== null) {
      if (typeof scopeRaw !== "string" || !SCOPES.has(scopeRaw as ReconcileSearchScope)) {
        return NextResponse.json(
          { success: false, error: "scope inválido" },
          { status: 400 },
        );
      }
      scope = scopeRaw as ReconcileSearchScope;
    }

    let limit: number | undefined;
    if (limitRaw !== undefined && limitRaw !== null) {
      if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return NextResponse.json(
          { success: false, error: "limit inválido" },
          { status: 400 },
        );
      }
      limit = limitRaw;
    }

    const result = await searchReconcileCandidates(ctx.tenantId, {
      bankTxIds: ids as string[],
      query,
      scope,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      factoring: result.factoring,
    });
  } catch (error) {
    console.error("[Finance/Banking/CandidatesSearch] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar candidatos" },
      { status: 500 },
    );
  }
}
