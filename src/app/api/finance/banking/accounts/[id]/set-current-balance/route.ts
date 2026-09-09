import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { todayInChile } from "@/lib/dates-cl";
import { applyReportedBalance } from "@/modules/finance/banking/bank-balance.service";
import { notifyBankBalanceDiscrepancy } from "@/modules/finance/banking/bank-balance-notify";

const setCurrentBalanceSchema = z.object({
  balance: z.number().finite(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/finance/banking/accounts/[id]/set-current-balance
 *
 * Fija el saldo real de la cuenta desde Movimientos: crea snapshot MANUAL
 * a hoy (calendario Chile) y actualiza currentBalance. Si |delta| ≥ umbral
 * la nota es obligatoria (400 note_required).
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

    const asOfDate = todayInChile();
    const previousBalanceClp = Number(account.currentBalance ?? 0);
    const { balance, note } = parsed.data;

    const applied = await applyReportedBalance({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      bankAccountId: id,
      asOf: asOfDate,
      balance,
      source: "MANUAL",
      note: note ?? null,
      requireNoteIfExceeds: true,
    });

    if (!applied.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "note_required",
          delta: applied.discrepancy.delta,
          reported: applied.discrepancy.reported,
          computed: applied.discrepancy.computed,
          thresholdClp: applied.discrepancy.thresholdClp,
        },
        { status: 400 },
      );
    }

    if (applied.discrepancy.exceeds) {
      try {
        await notifyBankBalanceDiscrepancy({
          tenantId: ctx.tenantId,
          accountLabel: `${account.bankName} ${account.accountNumber}`,
          discrepancy: applied.discrepancy,
        });
      } catch (err) {
        console.error("[Finance/Banking/SetCurrentBalance] notify:", err);
      }
    }

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
        balanceClp: applied.resolvedBalanceClp,
        asOfDate,
        snapshotId: applied.snapshot.id,
        discrepancy: applied.discrepancy,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/SetCurrentBalance] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al fijar saldo";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
