import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { syncCurrentBalanceFromMovements } from "@/modules/finance/banking/bank-balance.service";
import { hideContentDuplicateBankTransactions } from "@/modules/finance/banking/bank-tx-dedupe.service";

/**
 * POST /api/finance/banking/accounts/[id]/recalculate-balance
 *
 * Oculta copias visibles de la misma huella de contenido y recalcula
 * `currentBalance` = ancla + movimientos posteriores.
 */
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
    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId, isActive: true },
      select: { id: true, currentBalance: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    const previousBalanceClp = Number(account.currentBalance ?? 0);
    const deduped = await hideContentDuplicateBankTransactions({
      tenantId: ctx.tenantId,
      bankAccountId: id,
      hiddenById: ctx.userId,
    });
    const resolved = await syncCurrentBalanceFromMovements(
      ctx.tenantId,
      id,
    );

    revalidatePath("/finanzas/bancos");
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/flujo-caja");

    return NextResponse.json({
      success: true,
      data: {
        previousBalanceClp,
        resolvedBalanceClp: resolved.resolvedBalanceClp,
        txCount: resolved.txCount,
        anchorBalanceClp: resolved.anchorBalanceClp,
        hiddenDuplicates: deduped.hidden,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/RecalculateBalance] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al recalcular saldo";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
