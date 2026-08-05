/**
 * Resolución compartida RuleAction → accountPlanId.
 * Usado por tryApplyRule, runHistoricalForRule y run-rules-only.
 *
 * Nota: no importa runHistoricalForRule aquí para evitar ciclo con
 * automatch-rule.service (que es dueño de findMatchingRule / tipos).
 * runHistoricalForRule importa este módulo con `import()` dinámico.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveAccountPlanIdForFlowRow } from "./flow-row-account-plan.service";
import {
  isFlowRowAction,
  isLegacyAction,
  isTgrPickAction,
  type RuleAction,
} from "./automatch-rule.service";

export type ResolvedRuleAction =
  | { ok: true; accountPlanId: string; requiresReview: boolean }
  | {
      ok: false;
      reason: "TGR_MANUAL" | "ROW_NOT_FOUND" | "ROW_WITHOUT_ACCOUNT" | "NO_ACCOUNT_PLAN";
    };

export async function resolveRuleAction(
  tenantId: string,
  action: RuleAction,
): Promise<ResolvedRuleAction> {
  if (isTgrPickAction(action)) {
    return { ok: false, reason: "TGR_MANUAL" };
  }

  if (isFlowRowAction(action)) {
    const flowRow = await prisma.financeFlowRow.findFirst({
      where: {
        id: action.flowRowId,
        tenantId,
        archivedAt: null,
      },
      select: { id: true, categoryId: true },
    });
    if (!flowRow) {
      return { ok: false, reason: "ROW_NOT_FOUND" };
    }
    const accountPlanId = await resolveAccountPlanIdForFlowRow(tenantId, flowRow);
    if (!accountPlanId) {
      return { ok: false, reason: "ROW_WITHOUT_ACCOUNT" };
    }
    return {
      ok: true,
      accountPlanId,
      requiresReview: action.requiresReview !== false,
    };
  }

  if (!isLegacyAction(action) || !action.accountPlanId) {
    return { ok: false, reason: "NO_ACCOUNT_PLAN" };
  }

  return {
    ok: true,
    accountPlanId: action.accountPlanId,
    requiresReview: action.requiresReview,
  };
}

export function reasonToUserMessage(
  reason: Exclude<ResolvedRuleAction, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "ROW_NOT_FOUND":
      return "Fila de flujo de la regla no encontrada";
    case "ROW_WITHOUT_ACCOUNT":
      return "La fila de flujo no tiene cuenta contable asociada; asigná categoría con cuenta";
    case "TGR_MANUAL":
      return "Regla TGR requiere elección manual";
    case "NO_ACCOUNT_PLAN":
      return "Regla sin cuenta contable destino";
  }
}
