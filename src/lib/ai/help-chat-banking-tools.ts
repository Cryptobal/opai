/**
 * Tools MCP / help-chat para operaciones bancarias diarias:
 * movimientos, conciliación, clasificación a fila de flujo, autorización TE.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storePreview, consumePreview } from "@/lib/ai/dte-preview-cache";
import { hasCapability, type RolePermissions } from "@/lib/permissions";
import { isUuid } from "@/lib/utils/uuid";
import { listBankAccounts } from "@/modules/finance/banking/bank-account.service";
import { listBankTransactions } from "@/modules/finance/banking/bank-transaction.service";
import {
  confirmAllSuggestions,
  findDteCandidates,
  findFactoringCandidates,
  findFactoringBatchesForBankTxs,
  listTransactionLinks,
  setTransactionLinks,
} from "@/modules/finance/banking/bank-tx-link.service";
import {
  findMatchingRule,
  flowRowSuggestionFromEvaluation,
  isFlowRowAction,
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import {
  normalizeClassifyRut,
  rankClassifySuggestions,
  isTgrRut,
  type ClassifySuggestion,
} from "@/modules/finance/banking/flow-classify.service";
import { extractCanonicalRutFromBankText } from "@/modules/finance/banking/rut-extract";
import { recognizeRutsForTransactions } from "@/modules/finance/banking/rut-recognition.service";
import { loadPayrollCandidates } from "@/modules/finance/banking/payroll-candidates.service";
import {
  resolvePayrollFlowRows,
  resolveSupplierCategoryRow,
} from "@/modules/finance/banking/classify-flow-rows";
import { resolveAccountPlanIdForFlowRow } from "@/modules/finance/banking/flow-row-account-plan.service";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";
import { buildFlowInsights } from "@/modules/finance/flow-v3/insights.service";
import { listRows } from "@/modules/finance/flow-v3/rows.service";
import { listAccountsForRow } from "@/modules/finance/flow-v3/rowAccount.service";

const PAYROLL_WINDOW_DAYS = 120;

type BankMovementStatus = "all" | "unmatched" | "pending_authorize" | "reconciled";

export function statusToTab(status: BankMovementStatus): "all" | "recognized" | "unrecognized" | "matched" {
  switch (status) {
    case "unmatched":
      return "unrecognized";
    case "pending_authorize":
      return "recognized";
    case "reconciled":
      return "matched";
    default:
      return "all";
  }
}

async function logAiAction(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: opts.args as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch {
    /* best-effort */
  }
}

function denyBankingView(perms: RolePermissions) {
  return !hasCapability(perms, "banking_view");
}

function denyBankingManage(perms: RolePermissions) {
  return !hasCapability(perms, "banking_manage");
}

function denyCashflowView(perms: RolePermissions) {
  return !hasCapability(perms, "cashflow_view");
}

export async function resolveBankAccountId(
  tenantId: string,
  bankAccountId?: string | null,
  bankAccountName?: string | null,
): Promise<{ id: string; label: string } | { error: string }> {
  if (bankAccountId && isUuid(bankAccountId)) {
    const acc = await prisma.financeBankAccount.findFirst({
      where: { id: bankAccountId, tenantId },
      select: { id: true, bankName: true, accountNumber: true },
    });
    if (!acc) return { error: "Cuenta bancaria no encontrada." };
    return { id: acc.id, label: `${acc.bankName} · ${acc.accountNumber}` };
  }
  const needle = (bankAccountName ?? bankAccountId ?? "").trim().toLowerCase();
  if (!needle) return { error: "Indica bank_account_id o bank_account_name." };
  const accounts = await listBankAccounts(tenantId);
  const hits = accounts.filter((a) => {
    const label = `${a.bankName} ${a.accountNumber}`.toLowerCase();
    return label.includes(needle) || a.bankName.toLowerCase().includes(needle);
  });
  if (hits.length === 0) return { error: `No encontré cuenta bancaria para "${bankAccountName ?? bankAccountId}".` };
  if (hits.length > 1) {
    return {
      error: `Hay ${hits.length} cuentas que coinciden. Usa bank_account_id. Opciones: ${hits
        .slice(0, 5)
        .map((a) => `${a.bankName} ${a.accountNumber} (${a.id})`)
        .join("; ")}`,
    };
  }
  const acc = hits[0]!;
  return { id: acc.id, label: `${acc.bankName} · ${acc.accountNumber}` };
}

export async function resolveFlowRowByNameOrId(
  tenantId: string,
  flowRowId?: string | null,
  flowRowName?: string | null,
): Promise<
  | { id: string; name: string; section: string; categoryId: string | null }
  | { error: string }
> {
  if (flowRowId && isUuid(flowRowId)) {
    const row = await prisma.financeFlowRow.findFirst({
      where: { id: flowRowId, tenantId, archivedAt: null },
      select: { id: true, name: true, section: true, categoryId: true },
    });
    if (!row) return { error: "Fila de flujo no encontrada." };
    return row;
  }
  const needle = (flowRowName ?? flowRowId ?? "").trim().toLowerCase();
  if (!needle) return { error: "Indica flow_row_id o flow_row_name." };
  const rows = await listRows(tenantId);
  const active = rows.filter((r) => !r.archivedAt);
  const hits = active.filter((r) => r.name.toLowerCase().includes(needle));
  if (hits.length === 0) {
    return { error: `No encontré fila de flujo para "${flowRowName ?? flowRowId}".` };
  }
  if (hits.length > 1) {
    return {
      error: `Hay ${hits.length} filas que coinciden. Usa flow_row_id. Opciones: ${hits
        .slice(0, 8)
        .map((r) => `${r.section} · ${r.name} (${r.id})`)
        .join("; ")}`,
    };
  }
  const row = hits[0]!;
  return {
    id: row.id,
    name: row.name,
    section: row.section,
    categoryId: row.categoryId,
  };
}

export async function fetchClassifySuggestions(
  tenantId: string,
  transactionId: string,
): Promise<
  | {
      transactionId: string;
      beneficiaryRut: string | null;
      amountAbs: number;
      identity: Record<string, unknown> | null;
      suggestions: ClassifySuggestion[];
    }
  | { error: string; status?: number }
> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: transactionId, tenantId, hiddenAt: null },
    select: { id: true, amount: true, description: true, reference: true },
  });
  if (!tx) return { error: "Movimiento no encontrado.", status: 404 };

  const amount = Number(tx.amount);
  const amountAbs = Math.abs(amount);

  const [identityMap, cfg, evaluation, payrollRows] = await Promise.all([
    recognizeRutsForTransactions(tenantId, [
      {
        id: tx.id,
        description: tx.description ?? null,
        reference: tx.reference ?? null,
      },
    ]),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { matchAmountToleranceClp: true },
    }),
    findMatchingRule(tenantId, {
      amount,
      description: tx.description ?? "",
      reference: tx.reference,
    }),
    resolvePayrollFlowRows(tenantId),
  ]);

  const identity = identityMap.get(tx.id);
  const beneficiaryRut =
    normalizeClassifyRut(identity?.rut) ??
    normalizeClassifyRut(
      extractCanonicalRutFromBankText(tx.description ?? "") ??
        extractCanonicalRutFromBankText(tx.reference ?? ""),
    );
  const tol = cfg?.matchAmountToleranceClp ?? 5000;

  let ruleHit: {
    flowRowId: string;
    label: string;
    requiresReview: boolean;
    ruleName?: string;
  } | null = null;
  const flowSug = flowRowSuggestionFromEvaluation(evaluation);
  if (flowSug) {
    const row = await prisma.financeFlowRow.findFirst({
      where: { id: flowSug.flowRowId, tenantId },
      select: { id: true, name: true },
    });
    if (row) {
      ruleHit = {
        flowRowId: row.id,
        label: row.name,
        requiresReview: flowSug.requiresReview,
        ruleName: flowSug.ruleName,
      };
    }
  } else if (evaluation && isFlowRowAction(evaluation.action)) {
    /* handled via flowSug */
  }

  const payrollCandidates =
    identity?.kind === "guardia" && identity.entityId
      ? (
          await loadPayrollCandidates(tenantId, [identity.entityId], PAYROLL_WINDOW_DAYS)
        ).get(identity.entityId) ?? []
      : [];

  let supplierCategoryRow: { flowRowId: string; label: string } | null = null;
  let supplierCategoryName: string | null = null;
  if (identity?.kind === "supplier" && identity.entityId) {
    const resolved = await resolveSupplierCategoryRow(tenantId, identity.entityId);
    if (resolved) {
      supplierCategoryRow = resolved.row;
      supplierCategoryName = resolved.categoryName;
    }
  }

  let dteReceived: { dteId: string; label: string } | null = null;
  if (beneficiaryRut && amount < 0) {
    const pending = await prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "RECEIVED",
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        voidedByCreditNoteId: null,
        issuerRut: { not: "" },
      },
      select: {
        id: true,
        folio: true,
        issuerName: true,
        issuerRut: true,
        totalAmount: true,
        amountPaid: true,
      },
      take: 200,
    });
    const hit = pending.find((d) => {
      const rut = normalizeClassifyRut(d.issuerRut);
      if (!rut || rut !== beneficiaryRut) return false;
      const pendingClp = Number(d.totalAmount) - Number(d.amountPaid);
      return Math.abs(pendingClp - amountAbs) <= tol;
    });
    if (hit) {
      dteReceived = {
        dteId: hit.id,
        label: `${hit.issuerName ?? "Proveedor"} F°${hit.folio}`,
      };
    }
  }

  const suggestions = rankClassifySuggestions({
    beneficiaryRut,
    amountAbs,
    amountToleranceClp: tol,
    ruleHit,
    guardiaState: identity?.guardiaState ?? null,
    payrollCandidates,
    liquidacionRow: payrollRows.liquidacionRow,
    anticipoRow: payrollRows.anticipoRow,
    finiquitoRow: payrollRows.finiquitoRow,
    teRowId: payrollRows.teRow?.flowRowId ?? null,
    teRowLabel: payrollRows.teRow?.label,
    retiroSocioRow: payrollRows.retiroSocioRow,
    devolPrestamoSocioRow: payrollRows.devolPrestamoSocioRow,
    supplierCategoryRow,
    supplierCategoryName,
    dteReceived,
  });

  return {
    transactionId: tx.id,
    beneficiaryRut,
    amountAbs,
    identity: identity
      ? {
          kind: identity.kind,
          name: identity.entityName,
          guardiaState: identity.guardiaState ?? null,
          alsoRegisteredAs: identity.alsoRegisteredAs,
        }
      : null,
    suggestions,
  };
}

function matchSourceFromClassify(body: {
  source?: "rule" | "payroll" | "te" | "heuristic" | "finiquito";
  payrollKind?: "LIQUIDACION" | "ANTICIPO" | "FINIQUITO";
}): "RULE" | "PAYROLL" | "FINIQUITO" | "TURNO_EXTRA" | "INFERRED" | "MANUAL" {
  switch (body.source) {
    case "rule":
      return "RULE";
    case "te":
      return "TURNO_EXTRA";
    case "finiquito":
      return "FINIQUITO";
    case "payroll":
      return body.payrollKind === "FINIQUITO" ? "FINIQUITO" : "PAYROLL";
    case "heuristic":
      return "INFERRED";
    default:
      return "MANUAL";
  }
}

export type ClassifyBankMovementInput = {
  bankTransactionId: string;
  flowRowId: string;
  accountPlanId?: string | null;
  note?: string;
  alsoBankTransactionIds?: string[];
  source?: "rule" | "payroll" | "te" | "heuristic" | "finiquito";
  matchedByRuleId?: string | null;
  payrollKind?: "LIQUIDACION" | "ANTICIPO" | "FINIQUITO";
  learnRule?: "RUT" | "DESCRIPTION" | "NONE";
  descriptionNeedle?: string;
};

export async function executeClassifyBankMovement(
  tenantId: string,
  userId: string,
  input: ClassifyBankMovementInput,
) {
  const allIds = [
    ...new Set([input.bankTransactionId, ...(input.alsoBankTransactionIds ?? [])]),
  ];
  if (allIds.length > 201) {
    throw new Error("Máximo 200 transacciones adicionales por request");
  }

  const txs = await prisma.financeBankTransaction.findMany({
    where: { id: { in: allIds }, tenantId, hiddenAt: null },
    select: { id: true, amount: true, description: true, reference: true },
  });
  if (txs.length !== allIds.length) {
    throw new Error("Una o más transacciones no existen, están ocultas o no pertenecen al tenant");
  }

  const row = await prisma.financeFlowRow.findFirst({
    where: { id: input.flowRowId, tenantId, archivedAt: null },
    select: { id: true, name: true, section: true, categoryId: true },
  });
  if (!row) throw new Error("Fila no encontrada");

  const accountPlanId = await resolveAccountPlanIdForFlowRow(
    tenantId,
    row,
    input.accountPlanId ?? null,
  );
  if (!accountPlanId) {
    throw new Error(
      "La fila no tiene cuenta contable asociada. Asigná una categoría con cuenta o enviá accountPlanId.",
    );
  }

  const learnMode = input.learnRule;
  if (learnMode === "DESCRIPTION" && !input.descriptionNeedle?.trim()) {
    throw new Error("descriptionNeedle es obligatorio para learnRule DESCRIPTION");
  }

  const existingLinks = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: { in: allIds } },
    select: { bankTransactionId: true },
  });
  const withLinks = new Set(existingLinks.map((l) => l.bankTransactionId));

  const errors: Array<{ id: string; message: string }> = [];
  let classified = 0;

  for (const tx of txs) {
    if (withLinks.has(tx.id)) {
      errors.push({
        id: tx.id,
        message: "La transacción ya tiene vínculos de conciliación; no se sobrescribe",
      });
      continue;
    }
    try {
      const amountAbs = Math.abs(Number(tx.amount));
      const isIncome = Number(tx.amount) > 0;
      await setTransactionLinks(tenantId, tx.id, userId, [
        {
          targetType: isIncome ? "INCOME" : "EXPENSE",
          targetId: null,
          amount: amountAbs,
          accountPlanId,
          flowRowId: row.id,
          note:
            input.note ??
            `Clasificado a fila flujo: ${row.name} (${normalizeNameForDedupe(row.name)})`,
          matchSource: matchSourceFromClassify(input),
          matchedByRuleId: input.matchedByRuleId ?? null,
        },
      ]);
      classified++;
    } catch (e) {
      errors.push({
        id: tx.id,
        message: e instanceof Error ? e.message : "Error al clasificar",
      });
    }
  }

  let ruleLearned: { ruleId: string; created: boolean } | null = null;
  const primary = txs.find((t) => t.id === input.bankTransactionId) ?? txs[0]!;

  if (learnMode === "DESCRIPTION") {
    const appliesTo = row.section === "INGRESOS" ? "DEPOSITS" : "WITHDRAWALS";
    ruleLearned = await upsertFlowRowRuleForDescription({
      tenantId,
      needle: input.descriptionNeedle!,
      flowRowId: row.id,
      rowName: row.name,
      appliesTo,
      userId,
    });
  } else if (learnMode !== "NONE") {
    const rutFromText =
      extractCanonicalRutFromBankText(primary.description ?? "") ??
      extractCanonicalRutFromBankText(primary.reference ?? "");
    const rutCanon = normalizeClassifyRut(rutFromText);
    if (rutCanon && !isTgrRut(rutCanon)) {
      ruleLearned = await upsertFlowRowRuleForRut({
        tenantId,
        rut: rutCanon,
        flowRowId: row.id,
        rowName: row.name,
        userId,
      });
    }
  }

  return {
    classified,
    failed: errors.length,
    errors,
    flowRowId: row.id,
    flowRowName: row.name,
    accountPlanId,
    ruleId: ruleLearned?.ruleId ?? null,
    ruleCreated: ruleLearned?.created ?? false,
    transactionId: primary.id,
    linked: classified > 0,
  };
}

export function bankingReadToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "list_bank_accounts",
        description:
          "Lista cuentas bancarias del tenant (Santander, etc.) con id, banco, número y saldo. Usar antes de list_bank_movements si no conoces el bank_account_id.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_bank_movements",
        description:
          "Lista movimientos bancarios con filtros: cuenta, fechas, estado (unmatched=sin sugerencia, pending_authorize=por autorizar TE/regla, reconciled=conciliados). Devuelve paginación y conteos por tab.",
        parameters: {
          type: "object",
          properties: {
            bank_account_id: { type: "string", description: "UUID de la cuenta bancaria." },
            bank_account_name: {
              type: "string",
              description: "Alternativa: nombre parcial del banco/cuenta (ej. Santander).",
            },
            date_from: { type: "string", description: "YYYY-MM-DD inclusive." },
            date_to: { type: "string", description: "YYYY-MM-DD inclusive." },
            status: {
              type: "string",
              enum: ["all", "unmatched", "pending_authorize", "reconciled"],
              description: "Filtro de bandeja. Default all.",
            },
            direction: {
              type: "string",
              enum: ["all", "inflow", "outflow"],
              description: "inflow=abonos, outflow=cargos.",
            },
            search: { type: "string", description: "Texto en glosa/referencia." },
            page: { type: "number", description: "Página (default 1)." },
            page_size: { type: "number", description: "Tamaño (default 50, máx 500)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_bank_movement_detail",
        description:
          "Detalle de un movimiento bancario: glosa, monto, estado, sugerencia pendiente, vínculos (DTE, TE, gasto/ingreso), flow_row_id y cuentas contables asociadas.",
        parameters: {
          type: "object",
          properties: {
            bank_transaction_id: { type: "string", description: "UUID del movimiento." },
          },
          required: ["bank_transaction_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_bank_movement_triage",
        description:
          "Resumen de triage bancario para un rango de fechas: conteos por estado (sin match / por autorizar / conciliados) y muestras de los más urgentes.",
        parameters: {
          type: "object",
          properties: {
            bank_account_id: { type: "string" },
            bank_account_name: { type: "string" },
            date_from: { type: "string", description: "YYYY-MM-DD." },
            date_to: { type: "string", description: "YYYY-MM-DD." },
            direction: { type: "string", enum: ["all", "inflow", "outflow"] },
            sample_size: { type: "number", description: "Muestras por bucket (default 5)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_bank_classify_suggestions",
        description:
          "Sugerencias de clasificación a fila del flujo para un movimiento (cascada RUT → regla → nómina → TE → heurística). Solo lectura.",
        parameters: {
          type: "object",
          properties: {
            bank_transaction_id: { type: "string" },
          },
          required: ["bank_transaction_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_bank_reconcile_candidates",
        description:
          "Candidatos para conciliar un abono/cargo: DTEs, operaciones de factoring y lotes 1→N (depósito factoring → varias facturas).",
        parameters: {
          type: "object",
          properties: {
            bank_transaction_id: { type: "string" },
          },
          required: ["bank_transaction_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_bank_statement_imports",
        description:
          "Estado de importaciones de cartola (archivo, período, duplicados, conteo importado). Opcional filtrar por cuenta.",
        parameters: {
          type: "object",
          properties: {
            bank_account_id: { type: "string" },
            bank_account_name: { type: "string" },
            limit: { type: "number", description: "Máx 100 (default 20)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_flow_rows",
        description:
          "Busca filas de la planilla de flujo de caja por nombre o sección (ej. FINANCIAMIENTO · Retiro socios). Devuelve id, cuentas contables y canonicalKey.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto a buscar en nombre/sección." },
            section: {
              type: "string",
              enum: [
                "INGRESOS",
                "REMUNERACIONES",
                "IMPUESTOS",
                "GAV",
                "OTROS",
                "FINANCIAMIENTO",
              ],
            },
            limit: { type: "number", description: "Default 20." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "flow_cashflow_insights",
        description:
          "Panel de flujo de caja: KPIs, desvíos mensuales (monthlyDrifts), salud de datos, cartera por cobrar, semanas en rojo y top movers. Complementa flow_cashflow_overview.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ];
}

export function bankingWriteToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "preview_classify_bank_movement",
        description:
          "PASO 1 — Clasificar movimiento a fila del flujo (dry-run). Resuelve flow_row_id y accountPlanId, valida que no tenga links previos. Devuelve previewToken (5 min). Usar flow_row_name (ej. Retiro socios) o flow_row_id.",
        parameters: {
          type: "object",
          properties: {
            bank_transaction_id: { type: "string" },
            flow_row_id: { type: "string" },
            flow_row_name: { type: "string", description: "Ej: Retiro socios, FINANCIAMIENTO." },
            account_plan_id: { type: "string", description: "Override opcional de cuenta contable." },
            note: { type: "string" },
            also_bank_transaction_ids: {
              type: "array",
              items: { type: "string" },
              description: "Clasificar en lote (máx 200 adicionales).",
            },
            source: {
              type: "string",
              enum: ["rule", "payroll", "te", "heuristic", "finiquito"],
            },
            learn_rule: { type: "string", enum: ["RUT", "DESCRIPTION", "NONE"] },
            description_needle: { type: "string" },
          },
          required: ["bank_transaction_id"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "classify_bank_movement",
        description:
          "PASO 2 — Persiste clasificación a fila del flujo (flow_row_id obligatorio en el link). Pasa previewToken o los mismos args del preview.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            bank_transaction_id: { type: "string" },
            flow_row_id: { type: "string" },
            flow_row_name: { type: "string" },
            account_plan_id: { type: "string" },
            note: { type: "string" },
            also_bank_transaction_ids: { type: "array", items: { type: "string" } },
            source: { type: "string", enum: ["rule", "payroll", "te", "heuristic", "finiquito"] },
            learn_rule: { type: "string", enum: ["RUT", "DESCRIPTION", "NONE"] },
            description_needle: { type: "string" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_authorize_bank_suggestions",
        description:
          "PASO 1 — Dry-run de autorización masiva de movimientos Por autorizar (sugerencia de regla/TE pendiente). Lista cuántos se autorizarían y muestra ejemplos.",
        parameters: {
          type: "object",
          properties: {
            bank_account_id: { type: "string" },
            bank_account_name: { type: "string" },
            bank_transaction_ids: {
              type: "array",
              items: { type: "string" },
              description: "Si se omite, autoriza todos los pendientes de la cuenta.",
            },
            date_from: { type: "string" },
            date_to: { type: "string" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "authorize_bank_suggestions",
        description:
          "PASO 2 — Confirma autorización de sugerencias pendientes (convierte suggestedAccountPlanId en link real). Alto impacto: usar previewToken.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            bank_account_id: { type: "string" },
            bank_account_name: { type: "string" },
            bank_transaction_ids: { type: "array", items: { type: "string" } },
            date_from: { type: "string" },
            date_to: { type: "string" },
          },
        },
      },
    },
  ];
}

function parseClassifyArgs(args: Record<string, unknown>): ClassifyBankMovementInput | { error: string } {
  const bankTransactionId =
    typeof args.bank_transaction_id === "string" ? args.bank_transaction_id : "";
  if (!bankTransactionId) return { error: "bank_transaction_id es requerido." };

  const alsoRaw = args.also_bank_transaction_ids;
  const alsoBankTransactionIds = Array.isArray(alsoRaw)
    ? alsoRaw.filter((v): v is string => typeof v === "string")
    : undefined;

  const learnRaw = args.learn_rule;
  const learnRule =
    learnRaw === "RUT" || learnRaw === "DESCRIPTION" || learnRaw === "NONE"
      ? learnRaw
      : undefined;

  const sourceRaw = args.source;
  const source =
    sourceRaw === "rule" ||
    sourceRaw === "payroll" ||
    sourceRaw === "te" ||
    sourceRaw === "heuristic" ||
    sourceRaw === "finiquito"
      ? sourceRaw
      : undefined;

  return {
    bankTransactionId,
    flowRowId: typeof args.flow_row_id === "string" ? args.flow_row_id : "",
    accountPlanId:
      typeof args.account_plan_id === "string" ? args.account_plan_id : null,
    note: typeof args.note === "string" ? args.note : undefined,
    alsoBankTransactionIds,
    source,
    matchedByRuleId: null,
    learnRule,
    descriptionNeedle:
      typeof args.description_needle === "string" ? args.description_needle : undefined,
  };
}

async function buildClassifyInput(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<ClassifyBankMovementInput | { error: string }> {
  const parsed = parseClassifyArgs(args);
  if ("error" in parsed) return parsed;

  const row = await resolveFlowRowByNameOrId(
    tenantId,
    parsed.flowRowId || null,
    typeof args.flow_row_name === "string" ? args.flow_row_name : null,
  );
  if ("error" in row) return { error: row.error };

  return { ...parsed, flowRowId: row.id };
}

async function queryPendingAuthorizeTxs(
  tenantId: string,
  opts: {
    bankAccountId?: string;
    txIds?: string[];
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const where: Prisma.FinanceBankTransactionWhereInput = {
    tenantId,
    hiddenAt: null,
    reconciliationStatus: "UNMATCHED",
    suggestedAccountPlanId: { not: null },
  };
  if (opts.bankAccountId) where.bankAccountId = opts.bankAccountId;
  if (opts.txIds?.length) where.id = { in: opts.txIds };
  if (opts.dateFrom || opts.dateTo) {
    where.transactionDate = {};
    if (opts.dateFrom) where.transactionDate.gte = new Date(opts.dateFrom);
    if (opts.dateTo) where.transactionDate.lte = new Date(opts.dateTo);
  }
  return prisma.financeBankTransaction.findMany({
    where,
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      suggestedRuleId: true,
      suggestedAccountPlanId: true,
      bankAccountId: true,
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    take: 500,
  });
}

export async function toolListBankAccounts(tenantId: string, perms: RolePermissions) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view para ver cuentas bancarias." };
  }
  const accounts = await listBankAccounts(tenantId);
  return {
    ok: true,
    data: accounts.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      holderName: a.holderName,
      currency: a.currency,
      isDefault: a.isDefault,
      currentBalance: a.currentBalance != null ? Number(a.currentBalance) : null,
      accountPlan: a.accountPlan
        ? { id: a.accountPlan.id, code: a.accountPlan.code, name: a.accountPlan.name }
        : null,
    })),
  };
}

export async function toolListBankMovements(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view para listar movimientos." };
  }
  const acc = await resolveBankAccountId(
    tenantId,
    typeof args.bank_account_id === "string" ? args.bank_account_id : null,
    typeof args.bank_account_name === "string" ? args.bank_account_name : null,
  );
  if ("error" in acc) return { ok: false, error: acc.error };

  const status = (typeof args.status === "string"
    ? args.status
    : "all") as BankMovementStatus;
  const direction =
    args.direction === "inflow" || args.direction === "outflow" ? args.direction : "all";
  const page = typeof args.page === "number" && args.page > 0 ? args.page : 1;
  const pageSize =
    typeof args.page_size === "number"
      ? Math.min(Math.max(1, args.page_size), 500)
      : 50;

  const result = await listBankTransactions(tenantId, acc.id, {
    dateFrom: typeof args.date_from === "string" ? args.date_from : undefined,
    dateTo: typeof args.date_to === "string" ? args.date_to : undefined,
    search: typeof args.search === "string" ? args.search : undefined,
    tab: statusToTab(status),
    direction,
    page,
    pageSize,
  });

  const amountFilter =
    direction === "inflow"
      ? { amount: { gt: 0 } }
      : direction === "outflow"
        ? { amount: { lt: 0 } }
        : {};
  const base = {
    tenantId,
    bankAccountId: acc.id,
    hiddenAt: null,
    ...amountFilter,
  };
  const [all, recognized, unrecognized, matched] = await Promise.all([
    prisma.financeBankTransaction.count({ where: base }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: { not: null } },
    }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: null },
    }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: { in: ["MATCHED", "RECONCILED"] } },
    }),
  ]);

  return {
    ok: true,
    data: {
      bankAccount: acc,
      counts: { all, pending_authorize: recognized, unmatched: unrecognized, reconciled: matched },
      ...result,
      transactions: result.transactions.map((t) => ({
        id: t.id,
        transactionDate: t.transactionDate.toISOString().slice(0, 10),
        description: t.description,
        reference: t.reference,
        amount: Number(t.amount),
        balance: t.balance != null ? Number(t.balance) : null,
        reconciliationStatus: t.reconciliationStatus,
        suggestedRuleName: (t as { suggestedRuleName?: string }).suggestedRuleName ?? null,
        suggestedAccountLabel: (t as { suggestedAccountLabel?: string }).suggestedAccountLabel ?? null,
        flowRowName: (t as { flowRowName?: string }).flowRowName ?? null,
        matchSource: (t as { matchSource?: string }).matchSource ?? null,
      })),
    },
  };
}

export async function toolGetBankMovementDetail(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view." };
  }
  const txId = typeof args.bank_transaction_id === "string" ? args.bank_transaction_id : "";
  if (!txId) return { ok: false, error: "bank_transaction_id es requerido." };

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
    },
  });
  if (!tx) return { ok: false, error: "Movimiento no encontrado." };

  const [links, rawLinks, suggestedRule, suggestedAccount] = await Promise.all([
    listTransactionLinks(tenantId, txId),
    prisma.financeBankTransactionLink.findMany({
      where: { tenantId, bankTransactionId: txId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        amount: true,
        accountPlanId: true,
        flowRowId: true,
        note: true,
        matchSource: true,
        matchedByRuleId: true,
        accountPlan: { select: { id: true, code: true, name: true } },
        flowRow: { select: { id: true, name: true, section: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.suggestedRuleId
      ? prisma.financeAutoMatchRule.findFirst({
          where: { id: tx.suggestedRuleId, tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    tx.suggestedAccountPlanId
      ? prisma.financeAccountPlan.findFirst({
          where: { id: tx.suggestedAccountPlanId, tenantId },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const flowRowIds = [...new Set(rawLinks.map((l) => l.flowRowId).filter(Boolean))] as string[];
  const rowAccounts: Record<string, Awaited<ReturnType<typeof listAccountsForRow>>> = {};
  for (const frId of flowRowIds) {
    rowAccounts[frId] = await listAccountsForRow(tenantId, frId);
  }

  return {
    ok: true,
    data: {
      id: tx.id,
      bankAccount: tx.bankAccount,
      transactionDate: tx.transactionDate.toISOString().slice(0, 10),
      description: tx.description,
      reference: tx.reference,
      amount: Number(tx.amount),
      balance: tx.balance != null ? Number(tx.balance) : null,
      reconciliationStatus: tx.reconciliationStatus,
      suggestedRuleId: tx.suggestedRuleId,
      suggestedRuleName: suggestedRule?.name ?? null,
      suggestedAccountPlanId: tx.suggestedAccountPlanId,
      suggestedAccountLabel: suggestedAccount
        ? `${suggestedAccount.code} ${suggestedAccount.name}`
        : null,
      links,
      linksRaw: rawLinks.map((l) => ({
        id: l.id,
        targetType: l.targetType,
        targetId: l.targetId,
        amount: Number(l.amount),
        accountPlan: l.accountPlan,
        flowRow: l.flowRow,
        flowRowId: l.flowRowId,
        flowRowAccounts: l.flowRowId ? rowAccounts[l.flowRowId] ?? [] : [],
        note: l.note,
        matchSource: l.matchSource,
        matchedByRuleId: l.matchedByRuleId,
      })),
    },
  };
}

export async function toolGetBankMovementTriage(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view." };
  }
  const acc = await resolveBankAccountId(
    tenantId,
    typeof args.bank_account_id === "string" ? args.bank_account_id : null,
    typeof args.bank_account_name === "string" ? args.bank_account_name : null,
  );
  if ("error" in acc) return { ok: false, error: acc.error };

  const direction =
    args.direction === "inflow" || args.direction === "outflow" ? args.direction : "all";
  const sampleSize =
    typeof args.sample_size === "number" ? Math.min(Math.max(1, args.sample_size), 20) : 5;
  const dateFrom = typeof args.date_from === "string" ? args.date_from : undefined;
  const dateTo = typeof args.date_to === "string" ? args.date_to : undefined;

  const amountFilter =
    direction === "inflow"
      ? { amount: { gt: 0 } }
      : direction === "outflow"
        ? { amount: { lt: 0 } }
        : {};
  const dateFilter =
    dateFrom || dateTo
      ? {
          transactionDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {};
  const base = {
    tenantId,
    bankAccountId: acc.id,
    hiddenAt: null,
    ...amountFilter,
    ...dateFilter,
  };

  const [all, pendingAuthorize, unmatched, reconciled] = await Promise.all([
    prisma.financeBankTransaction.count({ where: base }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: { not: null } },
    }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: null },
    }),
    prisma.financeBankTransaction.count({
      where: { ...base, reconciliationStatus: { in: ["MATCHED", "RECONCILED"] } },
    }),
  ]);

  const sampleSelect = {
    id: true,
    transactionDate: true,
    description: true,
    amount: true,
    suggestedAccountPlanId: true,
  } as const;

  const [pendingSamples, unmatchedSamples] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: { not: null } },
      select: sampleSelect,
      orderBy: { transactionDate: "desc" },
      take: sampleSize,
    }),
    prisma.financeBankTransaction.findMany({
      where: { ...base, reconciliationStatus: "UNMATCHED", suggestedAccountPlanId: null },
      select: sampleSelect,
      orderBy: { transactionDate: "desc" },
      take: sampleSize,
    }),
  ]);

  const fmt = (rows: typeof pendingSamples) =>
    rows.map((r) => ({
      id: r.id,
      date: r.transactionDate.toISOString().slice(0, 10),
      description: (r.description ?? "").slice(0, 120),
      amount: Number(r.amount),
    }));

  return {
    ok: true,
    data: {
      bankAccount: acc,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      direction,
      counts: {
        all,
        pending_authorize: pendingAuthorize,
        unmatched,
        reconciled,
      },
      samples: {
        pending_authorize: fmt(pendingSamples),
        unmatched: fmt(unmatchedSamples),
      },
      summary: `Cuenta ${acc.label}: ${pendingAuthorize} por autorizar, ${unmatched} sin match, ${reconciled} conciliados${dateFrom || dateTo ? ` (${dateFrom ?? "…"} → ${dateTo ?? "…"})` : ""}.`,
    },
  };
}

export async function toolGetBankClassifySuggestions(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view." };
  }
  const txId = typeof args.bank_transaction_id === "string" ? args.bank_transaction_id : "";
  if (!txId) return { ok: false, error: "bank_transaction_id es requerido." };
  const data = await fetchClassifySuggestions(tenantId, txId);
  if ("error" in data) return { ok: false, error: data.error };
  return { ok: true, data };
}

export async function toolGetBankReconcileCandidates(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view." };
  }
  const txId = typeof args.bank_transaction_id === "string" ? args.bank_transaction_id : "";
  if (!txId) return { ok: false, error: "bank_transaction_id es requerido." };
  const [dtes, factoring, factoringBatches] = await Promise.all([
    findDteCandidates(tenantId, txId),
    findFactoringCandidates(tenantId, txId),
    findFactoringBatchesForBankTxs(tenantId, [txId]),
  ]);
  return { ok: true, data: { dtes, factoring, factoringBatches } };
}

export async function toolListBankStatementImports(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyBankingView(perms)) {
    return { ok: false, error: "No tienes permiso banking_view." };
  }
  let bankAccountId: string | undefined;
  if (args.bank_account_id || args.bank_account_name) {
    const acc = await resolveBankAccountId(
      tenantId,
      typeof args.bank_account_id === "string" ? args.bank_account_id : null,
      typeof args.bank_account_name === "string" ? args.bank_account_name : null,
    );
    if ("error" in acc) return { ok: false, error: acc.error };
    bankAccountId = acc.id;
  }
  const limit =
    typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 100) : 20;
  const imports = await prisma.financeBankStatementImport.findMany({
    where: { tenantId, ...(bankAccountId ? { bankAccountId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
    },
  });
  return {
    ok: true,
    data: imports.map((i) => ({
      id: i.id,
      bankAccountId: i.bankAccountId,
      bankName: i.bankAccount.bankName,
      accountNumber: i.bankAccount.accountNumber,
      fileName: i.fileName,
      periodFrom: i.periodFrom?.toISOString().slice(0, 10) ?? null,
      periodTo: i.periodTo?.toISOString().slice(0, 10) ?? null,
      importedCount: i.importedCount,
      duplicateCount: i.duplicateCount,
      totalInFile: i.totalInFile,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

export async function toolSearchFlowRows(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  if (denyCashflowView(perms)) {
    return { ok: false, error: "No tienes permiso cashflow_view para buscar filas." };
  }
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  if (!query) return { ok: false, error: "query es requerido." };
  const section = typeof args.section === "string" ? args.section : undefined;
  const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 20;
  const rows = await listRows(tenantId);
  const hits = rows
    .filter((r) => !r.archivedAt)
    .filter((r) => (section ? r.section === section : true))
    .filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.section.toLowerCase().includes(query) ||
        (r.canonicalKey ?? "").toLowerCase().includes(query),
    )
    .slice(0, limit);

  const enriched = await Promise.all(
    hits.map(async (r) => {
      const accounts = await listAccountsForRow(tenantId, r.id);
      return {
        id: r.id,
        section: r.section,
        name: r.name,
        canonicalKey: r.canonicalKey,
        accounts: accounts.map((a) => ({
          accountPlanId: a.accountPlanId,
          code: a.accountPlan.code,
          name: a.accountPlan.name,
          isPrimary: a.isPrimary,
        })),
      };
    }),
  );

  return { ok: true, data: enriched };
}

export async function toolFlowCashflowInsights(tenantId: string, perms: RolePermissions) {
  if (denyCashflowView(perms)) {
    return { ok: false, error: "No tienes permiso cashflow_view." };
  }
  const insights = await buildFlowInsights(tenantId);
  return {
    ok: true,
    data: {
      todayYmd: insights.todayYmd,
      currentWeek: insights.currentWeek,
      saldoHoy: insights.saldoHoy,
      bufferClp: insights.bufferClp,
      warnThresholdClp: insights.warnThresholdClp,
      kpis: insights.kpis,
      dataHealth: insights.dataHealth,
      topMovers: insights.topMovers,
      porCobrarTotal: insights.porCobrarTotal,
      aging: insights.aging,
      recentSeals: insights.recentSeals,
      monthlyDrifts: insights.monthlyDrifts.slice(0, 12),
      openMoveWeeks: insights.openMoveWeeks,
      carteraSample: insights.cartera.slice(0, 15),
    },
  };
}

export async function toolPreviewClassifyBankMovement(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  if (denyBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_classify_bank_movement",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso banking_manage para clasificar movimientos." };
  }

  const input = await buildClassifyInput(tenantId, args);
  if ("error" in input) {
    return { ok: false, error: input.error };
  }

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: input.bankTransactionId, tenantId, hiddenAt: null },
    select: {
      id: true,
      amount: true,
      description: true,
      transactionDate: true,
      reconciliationStatus: true,
    },
  });
  if (!tx) return { ok: false, error: "Movimiento no encontrado." };

  const existing = await prisma.financeBankTransactionLink.count({
    where: { tenantId, bankTransactionId: input.bankTransactionId },
  });
  if (existing > 0) {
    return { ok: false, error: "El movimiento ya tiene vínculos; no se puede reclasificar por MCP." };
  }

  const row = await prisma.financeFlowRow.findFirst({
    where: { id: input.flowRowId, tenantId },
    select: { id: true, name: true, section: true, categoryId: true },
  });
  if (!row) return { ok: false, error: "Fila no encontrada." };

  const accountPlanId = await resolveAccountPlanIdForFlowRow(
    tenantId,
    row,
    input.accountPlanId ?? null,
  );
  if (!accountPlanId) {
    return {
      ok: false,
      error: "La fila no tiene cuenta contable. Usa search_flow_rows o pasa account_plan_id.",
    };
  }

  const account = await prisma.financeAccountPlan.findFirst({
    where: { id: accountPlanId, tenantId },
    select: { code: true, name: true },
  });

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "classify_bank_movement",
    args,
    computed: { input, row, accountPlanId, account },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_classify_bank_movement",
    args,
    status: "success",
    resultEntityId: tx.id,
    resultEntityType: "finance_bank_transaction",
    startedAt: t0,
  });

  return {
    ok: true,
    requiresConfirmation: true,
    previewToken,
    data: {
      bankTransactionId: tx.id,
      date: tx.transactionDate.toISOString().slice(0, 10),
      description: tx.description,
      amount: Number(tx.amount),
      flowRowId: row.id,
      flowRowName: row.name,
      flowRowSection: row.section,
      accountPlanId,
      accountPlanLabel: account ? `${account.code} ${account.name}` : accountPlanId,
      alsoCount: input.alsoBankTransactionIds?.length ?? 0,
      message: `Se clasificará a ${row.section} · ${row.name} (flow_row_id=${row.id}) con cuenta ${account?.code ?? accountPlanId}.`,
    },
  };
}

export async function toolClassifyBankMovement(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  if (denyBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "classify_bank_movement",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso banking_manage." };
  }

  let input: ClassifyBankMovementInput | null = null;
  const token = typeof args.previewToken === "string" ? args.previewToken : null;
  if (token) {
    const payload = consumePreview(token, tenantId, userId, "classify_bank_movement");
    if (payload?.computed?.input) {
      input = payload.computed.input as ClassifyBankMovementInput;
    }
  }
  if (!input) {
    const built = await buildClassifyInput(tenantId, args);
    if ("error" in built) return { ok: false, error: built.error };
    input = built;
  }

  try {
    const result = await executeClassifyBankMovement(tenantId, userId, input);
    await logAiAction({
      tenantId,
      userId,
      toolName: "classify_bank_movement",
      args,
      status: "success",
      resultEntityId: input.bankTransactionId,
      resultEntityType: "finance_bank_transaction",
      startedAt: t0,
    });
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al clasificar";
    await logAiAction({
      tenantId,
      userId,
      toolName: "classify_bank_movement",
      args,
      status: "internal_error",
      errorMessage: msg,
      startedAt: t0,
    });
    return { ok: false, error: msg };
  }
}

export async function toolPreviewAuthorizeBankSuggestions(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  if (denyBankingManage(perms)) {
    return { ok: false, error: "No tienes permiso banking_manage." };
  }

  let bankAccountId: string | undefined;
  if (args.bank_account_id || args.bank_account_name) {
    const acc = await resolveBankAccountId(
      tenantId,
      typeof args.bank_account_id === "string" ? args.bank_account_id : null,
      typeof args.bank_account_name === "string" ? args.bank_account_name : null,
    );
    if ("error" in acc) return { ok: false, error: acc.error };
    bankAccountId = acc.id;
  }

  const txIds = Array.isArray(args.bank_transaction_ids)
    ? args.bank_transaction_ids.filter((v): v is string => typeof v === "string")
    : undefined;

  const txs = await queryPendingAuthorizeTxs(tenantId, {
    bankAccountId,
    txIds,
    dateFrom: typeof args.date_from === "string" ? args.date_from : undefined,
    dateTo: typeof args.date_to === "string" ? args.date_to : undefined,
  });

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "authorize_bank_suggestions",
    args,
    computed: {
      bankAccountId: bankAccountId ?? null,
      txIds: txs.map((t) => t.id),
      count: txs.length,
    },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_authorize_bank_suggestions",
    args,
    status: "success",
    startedAt: t0,
  });

  return {
    ok: true,
    requiresConfirmation: true,
    previewToken,
    data: {
      wouldAuthorize: txs.length,
      bankAccountId: bankAccountId ?? null,
      samples: txs.slice(0, 10).map((t) => ({
        id: t.id,
        date: t.transactionDate.toISOString().slice(0, 10),
        description: (t.description ?? "").slice(0, 100),
        amount: Number(t.amount),
      })),
      message:
        txs.length === 0
          ? "No hay movimientos pendientes de autorizar con los filtros indicados."
          : `Se autorizarán ${txs.length} movimiento(s) con sugerencia pendiente (regla/TE).`,
    },
  };
}

export async function toolAuthorizeBankSuggestions(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  if (denyBankingManage(perms)) {
    return { ok: false, error: "No tienes permiso banking_manage." };
  }

  let bankAccountId: string | undefined;
  let txIds: string[] | undefined;

  const token = typeof args.previewToken === "string" ? args.previewToken : null;
  if (token) {
    const payload = consumePreview(token, tenantId, userId, "authorize_bank_suggestions");
    if (payload) {
      bankAccountId = (payload.computed.bankAccountId as string | null) ?? undefined;
      txIds = payload.computed.txIds as string[] | undefined;
      if (Array.isArray(txIds) && txIds.length === 0) {
        return { ok: true, data: { confirmed: 0 } };
      }
    }
  }

  if (!txIds) {
    if (args.bank_account_id || args.bank_account_name) {
      const acc = await resolveBankAccountId(
        tenantId,
        typeof args.bank_account_id === "string" ? args.bank_account_id : null,
        typeof args.bank_account_name === "string" ? args.bank_account_name : null,
      );
      if ("error" in acc) return { ok: false, error: acc.error };
      bankAccountId = acc.id;
    }
    txIds = Array.isArray(args.bank_transaction_ids)
      ? args.bank_transaction_ids.filter((v): v is string => typeof v === "string")
      : undefined;
  }

  if (!bankAccountId && (!txIds || txIds.length === 0)) {
    return {
      ok: false,
      error:
        "Indica bank_account_id/bank_account_name o bank_transaction_ids, o usa previewToken de preview_authorize_bank_suggestions.",
    };
  }

  try {
    const result = await confirmAllSuggestions(tenantId, userId, {
      bankAccountId,
      txIds,
    });
    await logAiAction({
      tenantId,
      userId,
      toolName: "authorize_bank_suggestions",
      args,
      status: "success",
      startedAt: t0,
    });
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al autorizar";
    return { ok: false, error: msg };
  }
}
