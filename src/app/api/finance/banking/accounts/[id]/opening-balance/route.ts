import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { setOpeningBalance } from "@/modules/finance/banking/bank-balance.service";

const openingSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  balance: z.number().finite(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * POST /api/finance/banking/accounts/[id]/opening-balance
 *
 * Define el saldo inicial del ledger: saldo al cierre de un día ya terminado.
 * A partir de ahí el saldo de la cuenta es saldo inicial + Σ movimientos
 * visibles posteriores. Cada cambio queda en el historial y auditado.
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
    const { id } = await params;
    const parsed = await parseBody(request, openingSchema);
    if (parsed.error) return parsed.error;

    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, currentBalance: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    const previousBalanceClp = Number(account.currentBalance ?? 0);
    let result: Awaited<ReturnType<typeof setOpeningBalance>>;
    try {
      result = await setOpeningBalance(ctx.tenantId, ctx.userId, {
        bankAccountId: id,
        asOfDate: parsed.data.asOfDate,
        balance: parsed.data.balance,
        note: parsed.data.note ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Saldo inicial inválido",
        },
        { status: 400 },
      );
    }

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "UPDATE",
      entity: "FinanceBankAccount",
      entityId: id,
      details: {
        kind: "LEDGER_OPENING_BALANCE",
        asOfDate: parsed.data.asOfDate,
        balance: parsed.data.balance,
        previousBalanceClp,
        resolvedBalanceClp: result.resolved.resolvedBalanceClp,
      },
      request,
    });

    revalidatePath("/finanzas/bancos");
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/flujo-caja");

    return NextResponse.json(
      {
        success: true,
        data: {
          openingId: result.opening.id,
          asOfDate: parsed.data.asOfDate,
          openingBalanceClp: parsed.data.balance,
          previousBalanceClp,
          resolvedBalanceClp: result.resolved.resolvedBalanceClp,
          txCount: result.resolved.txCount,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Finance/Banking/OpeningBalance] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al definir saldo inicial";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
