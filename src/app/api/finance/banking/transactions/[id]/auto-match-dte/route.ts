/**
 * POST /api/finance/banking/transactions/[id]/auto-match-dte
 *
 * Dispara manualmente el algoritmo de auto-match para una transacción
 * bancaria. Usado desde la UI de conciliación cuando el usuario quiere
 * forzar el intento (ej: recién creó el DTE faltante o corrigió el RUT).
 *
 * Reusa el mismo servicio que corre en el import — misma lógica
 * estricta (monto exacto + RUT en texto cuando hay ambigüedad).
 *
 * Devuelve siempre 200, incluso cuando NO matchea: el body trae el
 * detalle (`matched: false, reason: 'ambiguous|no_candidate|...'`)
 * para que la UI pueda mostrar el mensaje correspondiente.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { tryAutoMatchBankTransactionToDte } from "@/modules/finance/banking/auto-match-payment.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const result = await tryAutoMatchBankTransactionToDte(
      ctx.tenantId,
      id,
      ctx.userId,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/AutoMatchDte] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error en auto-match";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
