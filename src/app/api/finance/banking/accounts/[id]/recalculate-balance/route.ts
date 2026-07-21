import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  resolveAccountBalanceFromMovements,
  syncCurrentBalanceFromMovements,
} from "@/modules/finance/banking/bank-balance.service";

/**
 * POST /api/finance/banking/accounts/[id]/recalculate-balance
 *
 * Recalcula el saldo real de la cuenta desde el último snapshot + movimientos
 * visibles posteriores. No es un ajuste manual de flujo de caja.
 */
export async function POST(
  _request: Request,
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
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        currentBalance: true,
      },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    const before = await resolveAccountBalanceFromMovements(ctx.tenantId, id);

    if (before.anchorSnapshotDate == null) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Esta cuenta no tiene un snapshot de ancla (cartola o saldo manual). Importa una cartola con saldo de cierre o fija un saldo en el historial de la cuenta.",
        },
        { status: 400 },
      );
    }

    const previousBalanceClp = Number(account.currentBalance ?? before.resolvedBalanceClp);
    const resolved = await syncCurrentBalanceFromMovements(ctx.tenantId, id);

    revalidatePath("/finanzas/bancos");
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/flujo-caja");

    return NextResponse.json({
      success: true,
      data: {
        bankAccountId: id,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        previousBalanceClp,
        resolvedBalanceClp: resolved.resolvedBalanceClp,
        anchorSnapshotDate: resolved.anchorSnapshotDate?.toISOString() ?? null,
        anchorBalanceClp: resolved.anchorBalanceClp,
        txDeltaClp: resolved.txDeltaClp,
        txCount: resolved.txCount,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/RecalculateBalance] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al recalcular saldo" },
      { status: 500 },
    );
  }
}
