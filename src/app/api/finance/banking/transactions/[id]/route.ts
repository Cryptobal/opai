import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  hideTransaction,
  unhideTransaction,
} from "@/modules/finance/banking/bank-transaction.service";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/finance/banking/transactions/[id]
 * Devuelve una tx individual, normalizada al shape que consume el cliente
 * (BancosClient.TransactionRow). Usado por deep links cross-módulo
 * (ej. desde un DTE pagado → abrir el drawer de conciliación).
 */
export async function GET(
  request: NextRequest,
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
    const tx = await prisma.financeBankTransaction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountNumber: true },
        },
      },
    });
    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }
    // `category` en este modelo es String? (texto libre), no FK a tabla
    // de categorías. `accountPlan` no es una relación declarada en el
    // schema (solo existe `suggestedAccountPlanId` como FK lógica), por
    // eso resolvemos la sugerencia (regla + cuenta) a mano para no
    // romper el `TransactionRow` que consume el drawer.
    const [suggestedRule, suggestedAccount] = await Promise.all([
      tx.suggestedRuleId
        ? prisma.financeAutoMatchRule.findFirst({
            where: { id: tx.suggestedRuleId, tenantId: ctx.tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      tx.suggestedAccountPlanId
        ? prisma.financeAccountPlan.findFirst({
            where: { id: tx.suggestedAccountPlanId, tenantId: ctx.tenantId },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id: tx.id,
        bankAccountId: tx.bankAccountId,
        transactionDate: tx.transactionDate.toISOString(),
        description: tx.description,
        reference: tx.reference,
        amount: Number(tx.amount),
        balance: tx.balance != null ? Number(tx.balance) : null,
        reconciliationStatus: tx.reconciliationStatus,
        hiddenAt: tx.hiddenAt?.toISOString() ?? null,
        hiddenReason: tx.hiddenReason ?? null,
        suggestedRuleId: tx.suggestedRuleId ?? null,
        suggestedRuleName: suggestedRule?.name ?? null,
        suggestedAccountPlanId: tx.suggestedAccountPlanId ?? null,
        suggestedAccountLabel: suggestedAccount
          ? `${suggestedAccount.code} ${suggestedAccount.name}`
          : null,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/Transactions] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener movimiento" },
      { status: 500 }
    );
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hide"),
    reason: z.string().trim().min(1, "Motivo requerido").max(500),
  }),
  z.object({
    action: z.literal("unhide"),
  }),
]);

/**
 * PATCH /api/finance/banking/transactions/[id]
 * Acciones:
 *   { action: "hide", reason: string } — soft-delete con motivo
 *   { action: "unhide" } — restaurar
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;

    if (parsed.data.action === "hide") {
      await hideTransaction(ctx.tenantId, id, ctx.userId, parsed.data.reason);
    } else {
      await unhideTransaction(ctx.tenantId, id);
    }
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (error) {
    console.error("[Finance/Banking/Transactions] PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar movimiento";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
