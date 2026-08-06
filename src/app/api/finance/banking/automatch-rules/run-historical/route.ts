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
import {
  HISTORICAL_SCAN_BATCH,
  HISTORICAL_SCAN_DEFAULT_MAX,
  iterateUnmatchedBankTransactions,
} from "@/modules/finance/banking/automatch-rule.service";

const DEFAULT_RULE_HISTORICAL_MONTHS = 6;

const bodySchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  /** Si true incluye también las que ya tienen sugerencia (re-evalúa). */
  includeSuggested: z.boolean().optional(),
  /** Si viene, solo esa regla participa en la fase de reglas (tras DTE / TE). */
  ruleId: z.string().uuid().nullable().optional(),
  /**
   * Ventana en meses calendario hacia atrás desde hoy.
   * Sin `monthsBack`: no hay filtro de fecha (solo tope maxScan).
   * Si enviás `ruleId` pero no `monthsBack`, por defecto = 6 meses.
   */
  monthsBack: z.number().int().min(1).max(36).nullable().optional(),
  /** Tope duro de movimientos a escanear (default 20.000). */
  maxScan: z.number().int().min(1).max(50_000).optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/run-historical
 *
 * Corre el motor de auto-match (DTE + turnos extra + reglas) sobre
 * movimientos UNMATCHED visibles del tenant (o de una cuenta),
 * paginando con orden estable hasta agotar o alcanzar el tope.
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

    const maxScan = parsed.data.maxScan ?? HISTORICAL_SCAN_DEFAULT_MAX;
    const batchIds: string[] = [];
    let scanned = 0;
    let reachedCap = false;

    const aggregated = {
      total: 0,
      matched: 0,
      ambiguous: 0,
      noCandidate: 0,
      skipped: 0,
      ruleMatched: 0,
      ruleSuggested: 0,
      turnoExtraMatched: 0,
      payrollMatched: 0,
      finiquitoMatched: 0,
      inferredSuggested: 0,
      errors: [] as { bankTransactionId: string; message: string }[],
    };

    const mergeSummary = (
      summary: Awaited<ReturnType<typeof bulkAutoMatchBankTransactions>>,
    ) => {
      aggregated.total += summary.total;
      aggregated.matched += summary.matched;
      aggregated.ambiguous += summary.ambiguous;
      aggregated.noCandidate += summary.noCandidate;
      aggregated.skipped += summary.skipped;
      aggregated.ruleMatched += summary.ruleMatched;
      aggregated.ruleSuggested += summary.ruleSuggested;
      aggregated.turnoExtraMatched += summary.turnoExtraMatched;
      aggregated.payrollMatched += summary.payrollMatched;
      aggregated.finiquitoMatched += summary.finiquitoMatched;
      aggregated.inferredSuggested += summary.inferredSuggested;
      aggregated.errors.push(...summary.errors);
    };

    for await (const page of iterateUnmatchedBankTransactions(where, {
      batchSize: HISTORICAL_SCAN_BATCH,
      maxScan,
    })) {
      scanned = page.scanned;
      reachedCap = page.reachedCap;
      batchIds.push(page.row.id);

      if (
        batchIds.length >= HISTORICAL_SCAN_BATCH ||
        page.reachedCap
      ) {
        mergeSummary(
          await bulkAutoMatchBankTransactions(
            ctx.tenantId,
            batchIds,
            ctx.userId,
            parsed.data.ruleId ? { onlyRuleId: parsed.data.ruleId } : undefined,
          ),
        );
        batchIds.length = 0;
      }
    }

    if (batchIds.length > 0) {
      mergeSummary(
        await bulkAutoMatchBankTransactions(
          ctx.tenantId,
          batchIds,
          ctx.userId,
          parsed.data.ruleId ? { onlyRuleId: parsed.data.ruleId } : undefined,
        ),
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...aggregated, scanned, reachedCap },
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
