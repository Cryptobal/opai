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
import { Decimal } from "@prisma/client/runtime/library";
import type {
  FinanceAutoMatchRule,
  FinanceAutoMatchScope,
} from "@prisma/client";
import { normalizeRutForMatch } from "./rut-normalize";
import {
  extractAllCanonicalRutsFromBankText,
} from "./rut-extract";
import {
  isForbiddenNeedle,
  MERCHANT_NEEDLE_MIN_LEN,
  normalizeMerchantText,
} from "./merchant-key";

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
  /**
   * Valor esperado. Para AMOUNT_BETWEEN se usa { min, max }.
   * Para RUT_MATCHES acepta un string (legacy) o una lista de RUT.
   */
  value?: string | number | string[] | { min?: number; max?: number } | null;
}

export interface RuleConditions {
  /** Si "ALL", se requieren TODAS las condiciones. Si "ANY", al menos una. */
  mode: "ALL" | "ANY";
  items: RuleCondition[];
}

/** Acción legacy (cuenta contable / contraparte). */
export interface LegacyRuleAction {
  kind?: undefined;
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

/** Acción v5: enrutar a fila de flujo de caja. */
export interface FlowRowRuleAction {
  kind: "FLOW_ROW";
  flowRowId: string;
  requiresReview?: boolean;
}

/** Acción v5: pedir pick TGR (F29 / finiquito / convenio). */
export interface TgrPickRuleAction {
  kind: "TGR_PICK";
  requiresReview?: boolean;
}

export type RuleAction = LegacyRuleAction | FlowRowRuleAction | TgrPickRuleAction;

export function isFlowRowAction(a: RuleAction): a is FlowRowRuleAction {
  return (a as FlowRowRuleAction).kind === "FLOW_ROW";
}

export function isTgrPickAction(a: RuleAction): a is TgrPickRuleAction {
  return (a as TgrPickRuleAction).kind === "TGR_PICK";
}

export function isLegacyAction(a: RuleAction): a is LegacyRuleAction {
  return !("kind" in a) || a.kind == null;
}

export { isAmountNearUfExpected as evaluateUfAmountNear } from "@/modules/finance/flow-v3/uf-amount-near";

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

function toRutExpectedList(value: RuleCondition["value"]): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((v) => normalizeRutForMatch(String(v ?? "")))
    .filter((r) => r.length >= 8);
}

/**
 * Evalúa una condición individual contra una transacción.
 * Exportada para tests del criterio RUT_MATCHES.
 */
export function evaluateCondition(
  cond: RuleCondition,
  tx: AutoMatchTx
): boolean {
  const valueLower = (v: unknown) =>
    typeof v === "string" ? v.toLowerCase() : "";

  // Campo target
  let textTarget: string | null = null;
  let numTarget: number | null = null;

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
      // RUT se resuelve en el case RUT_MATCHES con el extractor canónico.
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
      const found = new Set([
        ...extractAllCanonicalRutsFromBankText(tx.description),
        ...extractAllCanonicalRutsFromBankText(tx.reference),
      ]);
      if (found.size === 0) return false;
      const expected = toRutExpectedList(cond.value);
      return expected.some((e) => found.has(e));
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

export interface FindMatchingRuleOptions {
  /**
   * Si se indica, solo se evalúa esa regla (debe existir para el tenant).
   * Útil para «aplicar una regla al histórico» sin ganar contra otras
   * por prioridad.
   */
  onlyRuleId?: string;
}

/**
 * Devuelve la PRIMERA regla habilitada (ordenada por priority asc) que
 * matchee la tx, o null si ninguna aplica. NO ejecuta efectos secundarios.
 */
export async function findMatchingRule(
  tenantId: string,
  tx: AutoMatchTx,
  options?: FindMatchingRuleOptions,
): Promise<AutoMatchEvaluation | null> {
  const rules = await prisma.financeAutoMatchRule.findMany({
    where: {
      tenantId,
      enabled: true,
      ...(options?.onlyRuleId ? { id: options.onlyRuleId } : {}),
    },
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
 * Evalúa si una regla matched tiene acción FLOW_ROW por condición RUT
 * (BENEFICIARY_RUT + RUT_MATCHES). Devuelve sugerencia tipada o null.
 */
export function flowRowSuggestionFromEvaluation(
  evaluation: AutoMatchEvaluation | null,
): { flowRowId: string; ruleId: string; ruleName: string; requiresReview: boolean } | null {
  if (!evaluation) return null;
  const action = evaluation.action;
  if (!isFlowRowAction(action)) return null;
  return {
    flowRowId: action.flowRowId,
    ruleId: evaluation.ruleId,
    ruleName: evaluation.ruleName,
    requiresReview: action.requiresReview !== false,
  };
}

/** Ítem de vista previa de regla (salida enriquecida para la UI). */
export interface PreviewMatch {
  id: string;
  dateYmd: string;
  amount: number;
  description: string;
  reference: string | null;
  reconciliationStatus: string;
}

export interface PreviewRuleMatchesResult {
  totalScanned: number;
  wouldMatch: number;
  totalClp: number;
  unmatchedCount: number;
  alreadyMatchedCount: number;
  /** Coincidencias (cap 200), ordenadas por fecha desc. */
  sample: PreviewMatch[];
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
  /** null/undefined = toda la cartola (cap 5000). 30/90/180 acotan por fecha. */
  daysBack: number | null = null,
): Promise<PreviewRuleMatchesResult> {
  const since =
    daysBack != null && daysBack > 0
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - daysBack);
          return d;
        })()
      : null;

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      ...(bankAccountId ? { bankAccountId } : {}),
      hiddenAt: null,
      ...(since ? { transactionDate: { gte: since } } : {}),
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
      reconciliationStatus: true,
    },
    orderBy: { transactionDate: "desc" },
    take: 5000, // safety cap
  });

  const matching: PreviewMatch[] = [];
  let totalClp = 0;
  let unmatchedCount = 0;
  let alreadyMatchedCount = 0;

  for (const tx of txs) {
    const amount = tx.amount.toNumber();
    const txData: AutoMatchTx = {
      amount,
      description: tx.description,
      reference: tx.reference,
    };
    if (!ruleScopeMatches(scope, amount)) continue;
    const results = conditions.items.map((c) => evaluateCondition(c, txData));
    const matches =
      conditions.mode === "ALL"
        ? results.every((b) => b)
        : results.some((b) => b);
    if (!matches) continue;

    const dateYmd =
      tx.transactionDate instanceof Date
        ? tx.transactionDate.toISOString().slice(0, 10)
        : String(tx.transactionDate).slice(0, 10);

    matching.push({
      id: tx.id,
      dateYmd,
      amount,
      description: tx.description,
      reference: tx.reference,
      reconciliationStatus: tx.reconciliationStatus,
    });
    totalClp += Math.abs(amount);
    if (tx.reconciliationStatus === "UNMATCHED") {
      unmatchedCount++;
    } else {
      alreadyMatchedCount++;
    }
  }

  return {
    totalScanned: txs.length,
    wouldMatch: matching.length,
    totalClp,
    unmatchedCount,
    alreadyMatchedCount,
    sample: matching.slice(0, 200),
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

export async function listRules(
  tenantId: string,
  filters?: { enabled?: boolean },
) {
  return prisma.financeAutoMatchRule.findMany({
    where: {
      tenantId,
      ...(filters?.enabled !== undefined ? { enabled: filters.enabled } : {}),
    },
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

/** Lote de lectura al aplicar reglas al histórico. */
export const HISTORICAL_SCAN_BATCH = 500;
/** Tope duro por corrida (configurable vía opciones). */
export const HISTORICAL_SCAN_DEFAULT_MAX = 20_000;

export type HistoricalScanCursor = {
  transactionDate: Date;
  id: string;
};

export type UnmatchedTxScanRow = {
  id: string;
  amount: { toNumber(): number };
  description: string;
  reference: string | null;
  transactionDate: Date;
};

/**
 * Página el histórico UNMATCHED con orden estable
 * (`transactionDate desc`, `id asc`) y cursor compuesto.
 * Avanza aunque el lote no produzca matches (evita bucles infinitos).
 */
export async function* iterateUnmatchedBankTransactions(
  where: Record<string, unknown>,
  options?: { batchSize?: number; maxScan?: number },
): AsyncGenerator<{
  row: UnmatchedTxScanRow;
  scanned: number;
  reachedCap: boolean;
}> {
  const batchSize = options?.batchSize ?? HISTORICAL_SCAN_BATCH;
  const maxScan = options?.maxScan ?? HISTORICAL_SCAN_DEFAULT_MAX;
  let cursor: HistoricalScanCursor | null = null;
  let scanned = 0;

  while (scanned < maxScan) {
    const take = Math.min(batchSize, maxScan - scanned);
    const batch: UnmatchedTxScanRow[] =
      await prisma.financeBankTransaction.findMany({
        where: {
          ...where,
          ...(cursor
            ? {
                OR: [
                  { transactionDate: { lt: cursor.transactionDate } },
                  {
                    AND: [
                      { transactionDate: cursor.transactionDate },
                      { id: { gt: cursor.id } },
                    ],
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          amount: true,
          description: true,
          reference: true,
          transactionDate: true,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "asc" }],
        take,
      });
    if (batch.length === 0) return;

    for (const row of batch) {
      scanned += 1;
      yield {
        row,
        scanned,
        reachedCap: scanned >= maxScan,
      };
    }

    const last: UnmatchedTxScanRow = batch[batch.length - 1]!;
    cursor = { transactionDate: last.transactionDate, id: last.id };
    if (batch.length < take) return;
  }
}

export type RunHistoricalForRuleResult = {
  scanned: number;
  suggested: number;
  autoMatched: number;
  reachedCap: boolean;
};

/**
 * Evalúa una regla específica contra el histórico UNMATCHED del tenant
 * (paginado, orden estable, tope duro 20.000). Las tx que matchean reciben
 * sugerencia (si requiresReview) o quedan auto-conciliadas (link + MATCHED).
 * Devuelve null si algo falla para no romper el caller (creación/edición).
 */
export async function runHistoricalForRule(
  tenantId: string,
  userId: string,
  ruleId: string,
  options?: { maxScan?: number },
): Promise<RunHistoricalForRuleResult | null> {
  try {
    // Import dinámico: evita ciclo estático con rule-action-resolver
    // (resolver importa tipos/guards de este módulo).
    const { resolveRuleAction } = await import("./rule-action-resolver");
    let suggested = 0;
    let autoMatched = 0;
    let scanned = 0;
    let reachedCap = false;

    for await (const page of iterateUnmatchedBankTransactions(
      {
        tenantId,
        reconciliationStatus: "UNMATCHED",
        hiddenAt: null,
        suggestedRuleId: null,
      },
      { maxScan: options?.maxScan },
    )) {
      scanned = page.scanned;
      reachedCap = page.reachedCap;
      const tx = page.row;
      const evaluation = await findMatchingRule(tenantId, {
        amount: tx.amount.toNumber(),
        description: tx.description,
        reference: tx.reference,
      });
      if (!evaluation || evaluation.ruleId !== ruleId) continue;
      const resolved = await resolveRuleAction(tenantId, evaluation.action);
      if (!resolved.ok) continue;
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
              tenantId,
              bankTransactionId: tx.id,
              targetType: isIncome ? "INCOME" : "EXPENSE",
              targetId: null,
              amount: new Decimal(amountAbs),
              accountPlanId: resolved.accountPlanId,
              note: `Auto-aplicado al crear/editar regla: ${evaluation.ruleName}`,
              matchSource: "RULE",
              matchedByRuleId: evaluation.ruleId,
              createdById: userId,
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
    }
    return { scanned, suggested, autoMatched, reachedCap };
  } catch (e) {
    console.warn(
      "[Finance/Banking/Rules] auto-historical failed for rule",
      ruleId,
      e,
    );
    return null;
  }
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.financeAutoMatchRule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new Error("Regla no encontrada");
  await prisma.financeAutoMatchRule.delete({ where: { id } });
}

function rutRuleConditionsMatch(
  stored: unknown,
  normalizedRut: string,
): boolean {
  const c = stored as RuleConditions;
  if (c?.mode !== "ALL" || !Array.isArray(c.items) || c.items.length !== 1) {
    return false;
  }
  const item = c.items[0];
  return (
    item.field === "BENEFICIARY_RUT" &&
    item.operator === "RUT_MATCHES" &&
    normalizeRutForMatch(String(item.value ?? "")) === normalizedRut
  );
}

/**
 * Crea o actualiza regla RUT → fila de flujo (idempotente por RUT normalizado).
 */
export async function upsertFlowRowRuleForRut(input: {
  tenantId: string;
  rut: string;
  flowRowId: string;
  rowName: string;
  userId: string | null;
}): Promise<{ ruleId: string; created: boolean }> {
  const normalizedRut = normalizeRutForMatch(input.rut);
  if (normalizedRut.length < 8) throw new Error("RUT inválido");

  const row = await prisma.financeFlowRow.findFirst({
    where: { id: input.flowRowId, tenantId: input.tenantId, archivedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("Fila de flujo no encontrada");

  const conditions: RuleConditions = {
    mode: "ALL",
    items: [
      {
        field: "BENEFICIARY_RUT",
        operator: "RUT_MATCHES",
        value: normalizedRut,
      },
    ],
  };
  const action: FlowRowRuleAction = {
    kind: "FLOW_ROW",
    flowRowId: input.flowRowId,
    requiresReview: false,
  };
  const ruleName = `RUT → ${input.rowName.trim() || "fila flujo"}`;

  const candidates = await prisma.financeAutoMatchRule.findMany({
    where: { tenantId: input.tenantId },
    select: { id: true, conditions: true },
  });
  const existing = candidates.find((r) =>
    rutRuleConditionsMatch(r.conditions, normalizedRut),
  );

  if (existing) {
    await prisma.financeAutoMatchRule.update({
      where: { id: existing.id },
      data: {
        name: ruleName,
        priority: 50,
        action: action as unknown as object,
      },
    });
    console.log("[Finance/Banking/Rules] upsertFlowRowRuleForRut: updated 1 rule");
    return { ruleId: existing.id, created: false };
  }

  const created = await prisma.financeAutoMatchRule.create({
    data: {
      tenantId: input.tenantId,
      name: ruleName,
      enabled: true,
      priority: 50,
      appliesTo: "BOTH",
      conditions: conditions as unknown as object,
      action: action as unknown as object,
      createdById: input.userId,
    },
  });
  console.log("[Finance/Banking/Rules] upsertFlowRowRuleForRut: created 1 rule");
  return { ruleId: created.id, created: true };
}

function descriptionRuleConditionsMatch(
  stored: unknown,
  needle: string,
): boolean {
  const c = stored as RuleConditions;
  if (c?.mode !== "ALL" || !Array.isArray(c.items) || c.items.length !== 1) {
    return false;
  }
  const item = c.items[0];
  return (
    item.field === "DESCRIPTION" &&
    item.operator === "CONTAINS" &&
    normalizeMerchantText(String(item.value ?? "")) === needle
  );
}

/**
 * Crea o actualiza regla DESCRIPTION CONTAINS → fila de flujo
 * (idempotente por needle + appliesTo).
 */
export async function upsertFlowRowRuleForDescription(input: {
  tenantId: string;
  needle: string;
  flowRowId: string;
  rowName: string;
  appliesTo: FinanceAutoMatchScope;
  userId: string | null;
}): Promise<{ ruleId: string; created: boolean }> {
  const needle = normalizeMerchantText(input.needle).trim();
  if (needle.length < MERCHANT_NEEDLE_MIN_LEN) {
    throw new Error(
      `El patrón de glosa debe tener al menos ${MERCHANT_NEEDLE_MIN_LEN} caracteres`,
    );
  }
  if (isForbiddenNeedle(needle)) {
    throw new Error(
      `El patrón «${needle}» es demasiado genérico; elegí un comerciante más específico`,
    );
  }
  if (input.appliesTo === "BOTH") {
    throw new Error("Las reglas de glosa deben aplicar a depósitos o retiros, no a ambos");
  }

  const row = await prisma.financeFlowRow.findFirst({
    where: { id: input.flowRowId, tenantId: input.tenantId, archivedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("Fila de flujo no encontrada");

  const conditions: RuleConditions = {
    mode: "ALL",
    items: [
      {
        field: "DESCRIPTION",
        operator: "CONTAINS",
        value: needle,
      },
    ],
  };
  const action: FlowRowRuleAction = {
    kind: "FLOW_ROW",
    flowRowId: input.flowRowId,
    requiresReview: false,
  };
  const ruleName = `Glosa «${needle}» → ${input.rowName.trim() || "fila flujo"}`;

  const candidates = await prisma.financeAutoMatchRule.findMany({
    where: { tenantId: input.tenantId, appliesTo: input.appliesTo },
    select: { id: true, conditions: true, appliesTo: true },
  });
  const existing = candidates.find((r) =>
    descriptionRuleConditionsMatch(r.conditions, needle),
  );

  if (existing) {
    await prisma.financeAutoMatchRule.update({
      where: { id: existing.id },
      data: {
        name: ruleName,
        priority: 60,
        enabled: true,
        action: action as unknown as object,
      },
    });
    console.log(
      "[Finance/Banking/Rules] upsertFlowRowRuleForDescription: updated 1 rule",
    );
    return { ruleId: existing.id, created: false };
  }

  const created = await prisma.financeAutoMatchRule.create({
    data: {
      tenantId: input.tenantId,
      name: ruleName,
      enabled: true,
      priority: 60,
      appliesTo: input.appliesTo,
      conditions: conditions as unknown as object,
      action: action as unknown as object,
      createdById: input.userId,
    },
  });
  console.log(
    "[Finance/Banking/Rules] upsertFlowRowRuleForDescription: created 1 rule",
  );
  return { ruleId: created.id, created: true };
}
