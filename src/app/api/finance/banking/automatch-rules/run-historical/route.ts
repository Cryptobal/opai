import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { bulkAutoMatchBankTransactions } from "@/modules/finance/banking/auto-match-payment.service";

const bodySchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  /** Si true incluye también las que ya tienen sugerencia (re-evalúa). */
  includeSuggested: z.boolean().optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/run-historical
 *
 * Corre el motor de auto-match (DTE + reglas) sobre todos los
 * movimientos UNMATCHED visibles del tenant (o de una cuenta). Útil
 * para evaluar reglas recién creadas contra el histórico.
 *
 * Hard cap de 1000 tx por ejecución para evitar timeouts. Si hay más,
 * el usuario llama de nuevo y se procesan las restantes en la próxima.
 */
export async function POST(request: NextRequest) {
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
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      reconciliationStatus: "UNMATCHED",
      hiddenAt: null,
    };
    if (parsed.data.bankAccountId) {
      where.bankAccountId = parsed.data.bankAccountId;
    }
    if (!parsed.data.includeSuggested) {
      // Por defecto solo procesa las que NO tienen sugerencia, para no
      // sobreescribir las ya marcadas. Si includeSuggested=true, las
      // reevalúa todas.
      where.suggestedAccountPlanId = null;
    }

    const txs = await prisma.financeBankTransaction.findMany({
      where,
      select: { id: true },
      take: 1000,
    });

    const summary = await bulkAutoMatchBankTransactions(
      ctx.tenantId,
      txs.map((t) => t.id),
      ctx.userId
    );

    return NextResponse.json({
      success: true,
      data: { ...summary, scanned: txs.length },
    });
  } catch (error) {
    console.error("[Finance/Banking/Rules/RunHistorical] error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Error al re-evaluar reglas en histórico";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
