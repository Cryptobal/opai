/**
 * Auto-match Rule Engine
 *
 * Reglas configurables que se evalúan contra cada movimiento bancario
 * (al importar cartola o vía endpoint manual). Inspirado en Buk / Zoho:
 * cada regla aplica a depósitos / retiros / ambos, define criterios sobre
 * los campos de la tx y una acción (categorizar a una cuenta contable
 * y/o vincular a una contraparte).
 *
 * Importante: este motor NO reemplaza al matcher exacto monto+RUT contra
 * DTEs (ese se sigue usando como primer intento). Las reglas son fallback
 * configurable para todo lo que no matchea por DTE.
 */

import { prisma } from "@/lib/prisma";
import type {
  FinanceAutoMatchRule,
  FinanceAutoMatchScope,
} from "@prisma/client";

// ── Schemas de conditions / action ──

export type RuleField =
  | "DESCRIPTION"
  | "REFERENCE"
  | "AMOUNT"
  | "BENEFICIARY_RUT";

export type RuleOperator =
  | "CONTAINS"
  | "STARTS_WITH"
  | "EQUALS"
  | "IS_EMPTY"
  | "AMOUNT_BETWEEN"
  | "AMOUNT_GTE"
  | "AMOUNT_LTE"
  | "RUT_MATCHES";

export interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  /** Valor esperado. Para AMOUNT_BETWEEN se usa { min, max }. */
  value?: string | number | { min?: number; max?: number } | null;
}

export interface RuleConditions {
  /** Si "ALL", se requieren TODAS las condiciones. Si "ANY", al menos una. */
  mode: "ALL" | "ANY";
  items: RuleCondition[];
}

export interface RuleAction {
  /**
   * RECOGNIZED: la tx queda vinculada a una entidad (counterparty/cuenta).
   * CATEGORIZED: la tx solo recibe una cuenta contable, sin vínculo a entidad.
   */
  handlingMode: "RECOGNIZED" | "CATEGORIZED";
  /** Cuenta contable destino (FinanceAccountPlan.id). */
  accountPlanId?: string | null;
  /** Proveedor por defecto si la regla aplica (FinanceSupplier.id). */
  supplierId?: string | null;
  /** RUT contraparte por defecto. Útil para ingresos sin DTE. */
  counterpartyRut?: string | null;
  /**
   * Si true, la tx se marca como "sugerida" pero requiere confirmación
   * humana antes de quedar conciliada. Si false, se aplica automático.
   */
  requiresReview: boolean;
}

export interface AutoMatchTx {
  amount: number; // ya como number (positivo = depósito, negativo = retiro)
  description: string;
  reference: string | null;
}

export interface AutoMatchEvaluation {
  ruleId: string;
  ruleName: string;
  action: RuleAction;
}

// ── Helpers ──

/** Quita puntos y guion. "12.345.678-K" → "12345678K". */
function normalizeRut(s: string): string {
  return s.toUpperCase().replace(/[.\-\s]/g, "");
}

/** Detecta el primer RUT presente en un string libre. */
function extractRutFromText(text: string): string | null {
  const match = text.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dKk]/);
  return match ? normalizeRut(match[0]) : null;
}

/**
 * Evalúa una condición individual contra una transacción.
 */
function evaluateCondition(
  cond: RuleCondition,
  tx: AutoMatchTx
): boolean {
  const valueLower = (v: unknown) =>
    typeof v === "string" ? v.toLowerCase() : "";

  // Campo target
  let textTarget: string | null = null;
  let numTarget: number | null = null;
  let rutTarget: string | null = null;

  switch (cond.field) {
    case "DESCRIPTION":
      textTarget = tx.description ?? "";
      break;
    case "REFERENCE":
      textTarget = tx.reference ?? "";
      break;
    case "AMOUNT":
      numTarget = Math.abs(tx.amount);
      break;
    case "BENEFICIARY_RUT":
      rutTarget =
        extractRutFromText(tx.description ?? "") ??
        extractRutFromText(tx.reference ?? "");
      break;
  }

  switch (cond.operator) {
    case "CONTAINS": {
      const needle = valueLower(cond.value);
      if (!needle) return false;
      return valueLower(textTarget).includes(needle);
    }
    case "STARTS_WITH": {
      const needle = valueLower(cond.value);
      if (!needle) return false;
      return valueLower(textTarget).startsWith(needle);
    }
    case "EQUALS": {
      const needle = valueLower(cond.value);
      return valueLower(textTarget) === needle;
    }
    case "IS_EMPTY":
      return !textTarget || textTarget.trim().length === 0;
    case "AMOUNT_GTE":
      return numTarget != null && numTarget >= Number(cond.value ?? 0);
    case "AMOUNT_LTE":
      return numTarget != null && numTarget <= Number(cond.value ?? 0);
    case "AMOUNT_BETWEEN": {
      const v = cond.value as { min?: number; max?: number } | null;
      if (!v || numTarget == null) return false;
      const okMin = v.min == null || numTarget >= v.min;
      const okMax = v.max == null || numTarget <= v.max;
      return okMin && okMax;
    }
    case "RUT_MATCHES": {
      if (!rutTarget) return false;
      const expected = normalizeRut(String(cond.value ?? ""));
      return rutTarget === expected;
    }
    default:
      return false;
  }
}

/** Verifica si la regla aplica al scope dado por el signo del monto. */
function ruleScopeMatches(
  scope: FinanceAutoMatchScope,
  amount: number
): boolean {
  if (scope === "BOTH") return true;
  if (scope === "DEPOSITS") return amount > 0;
  if (scope === "WITHDRAWALS") return amount < 0;
  return false;
}

/**
 * Devuelve la PRIMERA regla habilitada (ordenada por priority asc) que
 * matchee la tx, o null si ninguna aplica. NO ejecuta efectos secundarios.
 */
export async function findMatchingRule(
  tenantId: string,
  tx: AutoMatchTx
): Promise<AutoMatchEvaluation | null> {
  const rules = await prisma.financeAutoMatchRule.findMany({
    where: { tenantId, enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  for (const r of rules) {
    if (!ruleScopeMatches(r.appliesTo, tx.amount)) continue;
    const conditions = r.conditions as unknown as RuleConditions;
    if (!conditions || !Array.isArray(conditions.items)) continue;

    const results = conditions.items.map((c) => evaluateCondition(c, tx));
    const matches =
      conditions.mode === "ALL"
        ? results.every((b) => b)
        : results.some((b) => b);

    if (matches) {
      return {
        ruleId: r.id,
        ruleName: r.name,
        action: r.action as unknown as RuleAction,
      };
    }
  }
  return null;
}

/**
 * Cuenta cuántos movimientos en una ventana habría matcheado una regla
 * dada (sin guardar nada). Sirve para el botón "Probar regla" de la UI.
 */
export async function previewRuleMatches(
  tenantId: string,
  bankAccountId: string | null,
  scope: FinanceAutoMatchScope,
  conditions: RuleConditions,
  daysBack: number = 30
): Promise<{ totalScanned: number; wouldMatch: number; sample: AutoMatchTx[] }> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      ...(bankAccountId ? { bankAccountId } : {}),
      hiddenAt: null,
      transactionDate: { gte: since },
    },
    select: {
      amount: true,
      description: true,
      reference: true,
    },
    take: 5000, // safety cap
  });

  const matchingTxs: AutoMatchTx[] = [];
  for (const tx of txs) {
    const txData: AutoMatchTx = {
      amount: tx.amount.toNumber(),
      description: tx.description,
      reference: tx.reference,
    };
    if (!ruleScopeMatches(scope, txData.amount)) continue;
    const results = conditions.items.map((c) => evaluateCondition(c, txData));
    const matches =
      conditions.mode === "ALL"
        ? results.every((b) => b)
        : results.some((b) => b);
    if (matches) matchingTxs.push(txData);
  }

  return {
    totalScanned: txs.length,
    wouldMatch: matchingTxs.length,
    sample: matchingTxs.slice(0, 10),
  };
}

// ── CRUD ──

export interface CreateRuleInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  appliesTo?: FinanceAutoMatchScope;
  conditions: RuleConditions;
  action: RuleAction;
}

export async function listRules(tenantId: string) {
  return prisma.financeAutoMatchRule.findMany({
    where: { tenantId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function getRule(tenantId: string, id: string) {
  return prisma.financeAutoMatchRule.findFirst({
    where: { id, tenantId },
  });
}

export async function createRule(
  tenantId: string,
  userId: string | null,
  input: CreateRuleInput
): Promise<FinanceAutoMatchRule> {
  return prisma.financeAutoMatchRule.create({
    data: {
      tenantId,
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
      appliesTo: input.appliesTo ?? "BOTH",
      conditions: input.conditions as unknown as object,
      action: input.action as unknown as object,
      createdById: userId ?? null,
    },
  });
}

export async function updateRule(
  tenantId: string,
  id: string,
  patch: Partial<CreateRuleInput>
): Promise<FinanceAutoMatchRule> {
  const existing = await prisma.financeAutoMatchRule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new Error("Regla no encontrada");

  return prisma.financeAutoMatchRule.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.appliesTo !== undefined ? { appliesTo: patch.appliesTo } : {}),
      ...(patch.conditions !== undefined
        ? { conditions: patch.conditions as unknown as object }
        : {}),
      ...(patch.action !== undefined
        ? { action: patch.action as unknown as object }
        : {}),
    },
  });
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.financeAutoMatchRule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new Error("Regla no encontrada");
  await prisma.financeAutoMatchRule.delete({ where: { id } });
}
