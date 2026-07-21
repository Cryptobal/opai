import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { setBalanceSnapshot } from "@/modules/finance/banking/bank-balance.service";

const setCurrentBalanceSchema = z.object({
  balance: z.number().finite(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/finance/banking/accounts/[id]/set-current-balance
 *
 * Fija el saldo real de la cuenta desde Movimientos: crea snapshot MANUAL
 * a hoy y actualiza currentBalance. No es el ajuste de proyección de flujo de caja.
 */
export async function POST(
  request: NextRequest,
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

    const parsed = await parseBody(request, setCurrentBalanceSchema);
    if (parsed.error) return parsed.error;

    const { id } = await params;

    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId, isActive: true },
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        currency: true,
        currentBalance: true,
      },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    const today = new Date();
    const asOfDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const previousBalanceClp = Number(account.currentBalance ?? 0);
    const { balance, note } = parsed.data;

    const snapshot = await setBalanceSnapshot(ctx.tenantId, ctx.userId, {
      bankAccountId: id,
      asOfDate,
      balance,
      source: "MANUAL",
      note:
        note ??
        "Saldo fijado manualmente en Movimientos (saldo real del banco)",
    });

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
        balanceClp: balance,
        asOfDate,
        snapshotId: snapshot.id,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/SetCurrentBalance] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al fijar saldo";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
