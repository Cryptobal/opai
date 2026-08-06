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
import {
  findMatchingRule,
  HISTORICAL_SCAN_DEFAULT_MAX,
  iterateUnmatchedBankTransactions,
} from "@/modules/finance/banking/automatch-rule.service";
import {
  reasonToUserMessage,
  resolveRuleAction,
} from "@/modules/finance/banking/rule-action-resolver";

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
  /** Tope duro de movimientos a escanear (default 20.000). */
  maxScan: z.number().int().min(1).max(50_000).optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/run-rules-only
 *
 * Corre solo el motor de REGLAS (no DTE ni turno extra) sobre las tx
 * UNMATCHED del tenant. Mucho más rápido que run-historical porque
 * salta el matcher DTE y la búsqueda de turnos.
 *
 * Paginación con orden estable; bucle secuencial por tx para evitar
 * contención en `financeAutoMatchRule.update`.
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
    const maxScan = parsed.data.maxScan ?? HISTORICAL_SCAN_DEFAULT_MAX;

    let suggested = 0;
    let autoMatched = 0;
    let scanned = 0;
    let reachedCap = false;
    const errors: Array<{ id: string; message: string }> = [];

    for await (const page of iterateUnmatchedBankTransactions(where, {
      maxScan,
    })) {
      scanned = page.scanned;
      reachedCap = page.reachedCap;
      const tx = page.row;
      try {
        const evaluation = await findMatchingRule(ctx.tenantId, {
          amount: tx.amount.toNumber(),
          description: tx.description,
          reference: tx.reference,
        });
        if (!evaluation) continue;
        if (targetRuleId && evaluation.ruleId !== targetRuleId) continue;
        const resolved = await resolveRuleAction(
          ctx.tenantId,
          evaluation.action,
        );
        if (!resolved.ok) {
          if (
            resolved.reason === "ROW_NOT_FOUND" ||
            resolved.reason === "ROW_WITHOUT_ACCOUNT"
          ) {
            errors.push({
              id: tx.id,
              message: reasonToUserMessage(resolved.reason),
            });
          }
          continue;
        }

        if (resolved.requiresReview) {
          await prisma.financeBankTransaction.update({
            where: { id: tx.id },
            data: {
              suggestedRuleId: evaluation.ruleId,
              suggestedAccountPlanId: resolved.accountPlanId,
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
                accountPlanId: resolved.accountPlanId,
                note: `Re-evaluación de regla: ${evaluation.ruleName}`,
                matchSource: "RULE",
                matchedByRuleId: evaluation.ruleId,
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
    }

    return NextResponse.json({
      success: true,
      data: {
        scanned,
        suggested,
        autoMatched,
        errors,
        reachedCap,
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
