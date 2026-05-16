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

const DEFAULT_RULE_HISTORICAL_MONTHS = 6;
/** Máximo de movimientos por corrida (más recientes primero). */
const RUN_HISTORICAL_CAP = 2500;

const bodySchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  /** Si true incluye también las que ya tienen sugerencia (re-evalúa). */
  includeSuggested: z.boolean().optional(),
  /** Si viene, solo esa regla participa en la fase de reglas (tras DTE / TE). */
  ruleId: z.string().uuid().nullable().optional(),
  /**
   * Ventana en meses calendario hacia atrás desde hoy.
   * Sin `monthsBack`: no hay filtro de fecha (solo tope RUN_HISTORICAL_CAP).
   * Si enviás `ruleId` pero no `monthsBack`, por defecto = 6 meses.
   */
  monthsBack: z.number().int().min(1).max(36).nullable().optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/run-historical
 *
 * Corre el motor de auto-match (DTE + turnos extra + reglas) sobre
 * movimientos UNMATCHED visibles del tenant (o de una cuenta).
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

    if (parsed.data.ruleId) {
      const rule = await prisma.financeAutoMatchRule.findFirst({
        where: { id: parsed.data.ruleId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!rule) {
        return NextResponse.json(
          { success: false, error: "Regla no encontrada" },
          { status: 404 }
        );
      }
    }

    const effectiveMonthsBack =
      parsed.data.monthsBack ??
      (parsed.data.ruleId != null ? DEFAULT_RULE_HISTORICAL_MONTHS : undefined);

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      reconciliationStatus: "UNMATCHED",
      hiddenAt: null,
    };
    if (parsed.data.bankAccountId) {
      where.bankAccountId = parsed.data.bankAccountId;
    }
    if (!parsed.data.includeSuggested) {
      where.suggestedAccountPlanId = null;
    }

    if (effectiveMonthsBack != null) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setMonth(since.getMonth() - effectiveMonthsBack);
      where.transactionDate = { gte: since };
    }

    const txs = await prisma.financeBankTransaction.findMany({
      where,
      select: { id: true },
      orderBy: { transactionDate: "desc" },
      take: RUN_HISTORICAL_CAP,
    });

    const summary = await bulkAutoMatchBankTransactions(
      ctx.tenantId,
      txs.map((t) => t.id),
      ctx.userId,
      parsed.data.ruleId ? { onlyRuleId: parsed.data.ruleId } : undefined
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
