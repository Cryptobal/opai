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
import { Decimal } from "@prisma/client/runtime/library";
import { findMatchingRule } from "@/modules/finance/banking/automatch-rule.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  ruleId: z.string().uuid().nullable().optional(),
  /**
   * Si true, también re-evalúa tx que ya tienen suggestedRuleId
   * (útil cuando se modificó una regla y queremos actualizar la sugerencia).
   */
  reEvaluateSuggested: z.boolean().optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/run-rules-only
 *
 * Corre solo el motor de REGLAS (no DTE ni turno extra) sobre las tx
 * UNMATCHED del tenant. Mucho más rápido que run-historical porque
 * salta el matcher DTE y la búsqueda de turnos.
 *
 * Hard cap de 2000 por ejecución. Procesa lotes de 50 con
 * `findMatchingRule` para no saturar memoria.
 */
export async function POST(request: NextRequest) {
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
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      reconciliationStatus: "UNMATCHED",
      hiddenAt: null,
    };
    if (parsed.data.bankAccountId) where.bankAccountId = parsed.data.bankAccountId;
    if (!parsed.data.reEvaluateSuggested) {
      where.suggestedRuleId = null;
    }

    const targetRuleId = parsed.data.ruleId ?? null;

    const txs = await prisma.financeBankTransaction.findMany({
      where,
      select: {
        id: true,
        amount: true,
        description: true,
        reference: true,
      },
      take: 2000,
    });

    let suggested = 0;
    let autoMatched = 0;
    const errors: Array<{ id: string; message: string }> = [];

    const CHUNK = 50;
    for (let i = 0; i < txs.length; i += CHUNK) {
      const chunk = txs.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (tx) => {
          try {
            const evaluation = await findMatchingRule(ctx.tenantId, {
              amount: tx.amount.toNumber(),
              description: tx.description,
              reference: tx.reference,
            });
            if (!evaluation) return;
            if (targetRuleId && evaluation.ruleId !== targetRuleId) return;
            if (!evaluation.action.accountPlanId) return;

            if (evaluation.action.requiresReview) {
              await prisma.financeBankTransaction.update({
                where: { id: tx.id },
                data: {
                  suggestedRuleId: evaluation.ruleId,
                  suggestedAccountPlanId: evaluation.action.accountPlanId,
                },
              });
              suggested++;
            } else {
              const isIncome = tx.amount.toNumber() > 0;
              const amountAbs = Math.abs(tx.amount.toNumber());
              await prisma.$transaction([
                prisma.financeBankTransactionLink.create({
                  data: {
                    tenantId: ctx.tenantId,
                    bankTransactionId: tx.id,
                    targetType: isIncome ? "INCOME" : "EXPENSE",
                    targetId: null,
                    amount: new Decimal(amountAbs),
                    accountPlanId: evaluation.action.accountPlanId,
                    note: `Re-evaluación de regla: ${evaluation.ruleName}`,
                    createdById: ctx.userId,
                  },
                }),
                prisma.financeBankTransaction.update({
                  where: { id: tx.id },
                  data: { reconciliationStatus: "MATCHED" },
                }),
                prisma.financeAutoMatchRule.update({
                  where: { id: evaluation.ruleId },
                  data: {
                    timesMatched: { increment: 1 },
                    lastMatchedAt: new Date(),
                  },
                }),
              ]);
              autoMatched++;
            }
          } catch (err) {
            errors.push({
              id: tx.id,
              message: err instanceof Error ? err.message : "Error",
            });
          }
        }),
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        scanned: txs.length,
        suggested,
        autoMatched,
        errors,
        reachedCap: txs.length === 2000,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/Rules/RunRulesOnly] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 },
    );
  }
}
