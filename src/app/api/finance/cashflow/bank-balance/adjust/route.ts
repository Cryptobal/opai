import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { todayInChile } from "@/lib/dates-cl";
import { prisma } from "@/lib/prisma";
import { registerBankReading } from "@/modules/finance/banking/bank-balance.service";
import { notifyBankBalanceDiscrepancy } from "@/modules/finance/banking/bank-balance-notify";

const adjustSchema = z.object({
  bankAccountId: z.string().uuid(),
  balance: z.number().finite(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/finance/cashflow/bank-balance/adjust
 *
 * Desde el flujo de caja: registra el saldo que muestra el banco HOY como
 * lectura MANUAL y la cuadra contra el ledger. El flujo NO modifica el saldo
 * banco: "Banco hoy" sigue siendo saldo inicial + movimientos. Si hay
 * diferencia se devuelve el delta (y se notifica si supera el umbral).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "banking_manage")) {
    return NextResponse.json(
      { success: false, error: "Forbidden — requiere banking_manage" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(req, adjustSchema);
  if (parsed.error) return parsed.error;
  const { bankAccountId, balance, note } = parsed.data;

  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId: ctx.tenantId, isActive: true },
    select: { id: true, currency: true, bankName: true, accountNumber: true },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Cuenta bancaria no encontrada" },
      { status: 404 },
    );
  }
  if (account.currency !== "CLP") {
    return NextResponse.json(
      { success: false, error: "Sólo cuentas CLP participan del flujo de caja" },
      { status: 400 },
    );
  }

  const asOfDate = todayInChile();

  const applied = await registerBankReading({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    bankAccountId,
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
        link: "/finanzas/bancos?tab=transactions",
      });
    } catch (err) {
      console.error("[cashflow/bank-balance/adjust] notify:", err);
    }
  }

  // Invalida caches de FC (legacy + planilla v3).
  revalidatePath("/finanzas/flujo-caja");
  revalidatePath("/finanzas/flujo-caja/planilla");
  revalidatePath("/finanzas");

  return NextResponse.json({
    success: true,
    data: {
      snapshotId: applied.snapshot.id,
      /** Saldo del ledger (Banco hoy). No cambia por la lectura. */
      balance: applied.resolvedBalanceClp,
      readingBalance: balance,
      asOfDate,
      discrepancy: applied.discrepancy,
      needsOpening: applied.needsOpening,
    },
  });
}
