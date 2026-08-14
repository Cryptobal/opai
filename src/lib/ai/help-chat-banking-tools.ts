/**
 * Tools MCP / help-chat para Banca (cartola, triage, clasificar a fila,
 * autorizar sugerencias TE). Wrappers sobre servicios de
 * `@/modules/finance/banking/*` — mismo dominio que `/finanzas/bancos`.
 *
 * Mutaciones: preview_* → confirmación → tool persistente (previewToken).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storePreview, consumePreview } from "@/lib/ai/dte-preview-cache";
import { hasCapability, type RolePermissions } from "@/lib/permissions";
import { listBankTransactions } from "@/modules/finance/banking/bank-transaction.service";
import { listBankAccounts } from "@/modules/finance/banking/bank-account.service";
import {
  listTransactionLinks,
  confirmAllSuggestions,
  canReclassifyToFlowRow,
  reclassifyTransactionToFlowRow,
  setTransactionLinks,
} from "@/modules/finance/banking/bank-tx-link.service";
import { resolveAccountPlanIdForFlowRow } from "@/modules/finance/banking/flow-row-account-plan.service";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";
import {
  costCenterAssignmentSchema,
  type CostCenterAssignment,
} from "@/modules/finance/banking/cost-allocation-math";
import { previewCostCenterAssignment } from "@/modules/finance/banking/cost-allocation.service";

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

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
  } catch (e) {
    console.error("[help-chat-banking] logAiAction falló", e);
  }
}

function denied(msg: string) {
  return { ok: false as const, error: msg };
}

function requireBankingView(perms: RolePermissions) {
  return hasCapability(perms, "banking_view");
}

function requireBankingManage(perms: RolePermissions) {
  return hasCapability(perms, "banking_manage");
}

/** Mapea status MCP → tab del listado de movimientos. */
export function mapBankStatusToTab(
  status: string | undefined,
): "all" | "recognized" | "unrecognized" | "matched" {
  switch (status) {
    case "pending_authorize":
      return "recognized";
    case "unmatched":
      return "unrecognized";
    case "reconciled":
      return "matched";
    default:
      return "all";
  }
}

export function mapDirection(
  direction: string | undefined,
): "inflow" | "outflow" | "all" {
  if (direction === "inflow" || direction === "ingreso") return "inflow";
  if (direction === "outflow" || direction === "egreso") return "outflow";
  return "all";
}

/** Resuelve cuenta bancaria por UUID o nombre parcial (ej. "Santander"). */
export async function resolveBankAccountId(
  tenantId: string,
  accountId?: string | null,
  accountName?: string | null,
): Promise<
  | { ok: true; account: { id: string; bankName: string; accountNumber: string } }
  | { ok: false; error: string; accounts?: Array<{ id: string; bankName: string; accountNumber: string }> }
> {
  const accounts = await listBankAccounts(tenantId);
  const slim = accounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
  }));

  if (typeof accountId === "string" && accountId.trim()) {
    const hit = slim.find((a) => a.id === accountId.trim());
    if (!hit) return { ok: false, error: "Cuenta bancaria no encontrada (accountId).", accounts: slim };
    return { ok: true, account: hit };
  }

  const needle = (accountName ?? "").trim().toLowerCase();
  if (!needle) {
    if (slim.length === 1) return { ok: true, account: slim[0]! };
    return {
      ok: false,
      error:
        "Indicá accountId o accountName (ej. 'Santander'). Hay varias cuentas bancarias.",
      accounts: slim,
    };
  }

  const matches = slim.filter(
    (a) =>
      a.bankName.toLowerCase().includes(needle) ||
      a.accountNumber.toLowerCase().includes(needle),
  );
  if (matches.length === 1) return { ok: true, account: matches[0]! };
  if (matches.length === 0) {
    return { ok: false, error: `Ninguna cuenta coincide con "${accountName}".`, accounts: slim };
  }
  return {
    ok: false,
    error: `Varias cuentas coinciden con "${accountName}". Pasá accountId.`,
    accounts: matches,
  };
}

/**
 * Resuelve fila de flujo por UUID o por etiqueta "SECCIÓN · Nombre" / nombre.
 * Preferí flowRowId cuando lo tengas (evita ambigüedad por accountPlanId compartido).
 */
export async function resolveFlowRow(
  tenantId: string,
  flowRowId?: string | null,
  flowRowName?: string | null,
): Promise<
  | {
      ok: true;
      row: {
        id: string;
        name: string;
        section: string;
        categoryId: string | null;
        label: string;
      };
    }
  | { ok: false; error: string; candidates?: Array<{ id: string; label: string }> }
> {
  if (typeof flowRowId === "string" && flowRowId.trim()) {
    const row = await prisma.financeFlowRow.findFirst({
      where: { id: flowRowId.trim(), tenantId, archivedAt: null },
      select: { id: true, name: true, section: true, categoryId: true },
    });
    if (!row) return { ok: false, error: "Fila de flujo no encontrada (flowRowId)." };
    return {
      ok: true,
      row: {
        ...row,
        label: `${row.section} · ${row.name}`,
      },
    };
  }

  const raw = (flowRowName ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Indicá flowRowId o flowRowName (ej. 'FINANCIAMIENTO · Retiro socios')." };
  }

  const rows = await prisma.financeFlowRow.findMany({
    where: { tenantId, archivedAt: null },
    select: { id: true, name: true, section: true, categoryId: true },
    orderBy: [{ section: "asc" }, { orderIndex: "asc" }],
  });

  const normalized = normalizeNameForDedupe(raw);
  const withLabel = rows.map((r) => ({
    ...r,
    label: `${r.section} · ${r.name}`,
  }));

  // Exacto por "SECCIÓN · Nombre" o por nombre.
  const exact = withLabel.filter(
    (r) =>
      normalizeNameForDedupe(r.label) === normalized ||
      normalizeNameForDedupe(r.name) === normalized,
  );
  if (exact.length === 1) return { ok: true, row: exact[0]! };

  // Contiene
  const partial = withLabel.filter(
    (r) =>
      normalizeNameForDedupe(r.label).includes(normalized) ||
      normalizeNameForDedupe(r.name).includes(normalized),
  );
  if (partial.length === 1) return { ok: true, row: partial[0]! };
  if (partial.length === 0) {
    return {
      ok: false,
      error: `Ninguna fila de flujo coincide con "${raw}".`,
      candidates: withLabel.slice(0, 30).map((r) => ({ id: r.id, label: r.label })),
    };
  }
  return {
    ok: false,
    error: `Varias filas coinciden con "${raw}". Pasá flowRowId.`,
    candidates: partial.slice(0, 20).map((r) => ({ id: r.id, label: r.label })),
  };
}

async function countByTabs(
  tenantId: string,
  bankAccountId: string,
  dateFrom?: string,
  dateTo?: string,
  direction: "inflow" | "outflow" | "all" = "all",
) {
  const amountFilter =
    direction === "inflow"
      ? { amount: { gt: 0 } }
      : direction === "outflow"
        ? { amount: { lt: 0 } }
        : {};

  const dateFilter: Prisma.FinanceBankTransactionWhereInput = {};
  if (dateFrom || dateTo) {
    dateFilter.transactionDate = {};
    if (dateFrom) {
      (dateFilter.transactionDate as Prisma.DateTimeFilter).gte = new Date(dateFrom);
    }
    if (dateTo) {
      (dateFilter.transactionDate as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }
  }

  const base: Prisma.FinanceBankTransactionWhereInput = {
    tenantId,
    bankAccountId,
    hiddenAt: null,
    ...amountFilter,
    ...dateFilter,
  };

  const [all, pendingAuthorize, unmatched, reconciled] = await Promise.all([
    prisma.financeBankTransaction.count({ where: base }),
    prisma.financeBankTransaction.count({
      where: {
        ...base,
        reconciliationStatus: "UNMATCHED",
        suggestedAccountPlanId: { not: null },
      },
    }),
    prisma.financeBankTransaction.count({
      where: {
        ...base,
        reconciliationStatus: "UNMATCHED",
        suggestedAccountPlanId: null,
      },
    }),
    prisma.financeBankTransaction.count({
      where: {
        ...base,
        reconciliationStatus: { in: ["MATCHED", "RECONCILED"] },
      },
    }),
  ]);

  return {
    all,
    unmatched,
    pending_authorize: pendingAuthorize,
    reconciled,
    /** Alias UI: Sin reconocer / Por autorizar / Conciliados */
    labels: {
      unmatched: "Sin reconocer",
      pending_authorize: "Por autorizar",
      reconciled: "Conciliados",
    },
  };
}

function bankTxUrl(txId: string, bankAccountId: string) {
  return `/finanzas/bancos?accountId=${bankAccountId}&txId=${txId}`;
}

// ── Definitions ────────────────────────────────────────────────────────────

export function bankingReadToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "list_bank_movements",
        description:
          "Lista movimientos de cartola bancaria (Finanzas → Bancos). Filtra por cuenta (accountId o accountName ej. 'Santander'), rango de fechas, status (unmatched=Sin reconocer, pending_authorize=Por autorizar TE/regla, reconciled, all), dirección ingreso/egreso y búsqueda texto/RUT/monto. Devuelve id, fecha, monto, descripción, status, suggestedAccount, flowRow y conteos por estado.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta bancaria." },
            accountName: {
              type: "string",
              description: "Nombre parcial del banco/cuenta (ej. 'Santander').",
            },
            from: { type: "string", description: "Fecha desde YYYY-MM-DD." },
            to: { type: "string", description: "Fecha hasta YYYY-MM-DD." },
            status: {
              type: "string",
              enum: ["unmatched", "pending_authorize", "reconciled", "all"],
              description: "Default all.",
            },
            direction: {
              type: "string",
              enum: ["inflow", "outflow", "all", "ingreso", "egreso"],
              description: "inflow/ingreso = monto>0; outflow/egreso = monto<0.",
            },
            search: {
              type: "string",
              description: "Texto en descripción/referencia, RUT o monto.",
            },
            page: { type: "number", description: "Página (default 1)." },
            pageSize: { type: "number", description: "Máx 100, default 30." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bank_movement",
        description:
          "Detalle de un movimiento bancario + vínculos (expense/income links, flowRowId, accountPlanId, factoring, DTE). Incluye links a la UI de Bancos. Usa tras list_bank_movements o get_bank_triage_summary.",
        parameters: {
          type: "object",
          properties: {
            transactionId: {
              type: "string",
              description: "UUID del movimiento (FinanceBankTransaction).",
            },
          },
          required: ["transactionId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bank_triage_summary",
        description:
          "Triage corto de cartola para un rango: conteos Sin reconocer / Por autorizar / Conciliados, top unmatched ingresos y egresos, y muestra de Por autorizar (sugerencias TE/regla pendientes). Ideal para 'DESDE 01-08 qué falta reconocer'.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            accountName: { type: "string", description: "Ej. 'Santander'." },
            from: { type: "string", description: "YYYY-MM-DD (default: hace 30 días)." },
            to: { type: "string", description: "YYYY-MM-DD (default: hoy)." },
            topN: { type: "number", description: "Top unmatched por lado (default 8, máx 20)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_flow_rows",
        description:
          "Lista filas de la planilla de flujo de caja (para clasificar movimientos). Incluye section, name, flowRowId y cuenta contable primaria si existe. Filtrá por sección o búsqueda de nombre (ej. 'Retiro socios').",
        parameters: {
          type: "object",
          properties: {
            section: {
              type: "string",
              description:
                "INGRESOS | REMUNERACIONES | IMPUESTOS | GAV | OTROS | FINANCIAMIENTO",
            },
            search: {
              type: "string",
              description: "Filtro por nombre (ej. 'Retiro socios', 'Finiquitos').",
            },
            limit: { type: "number", description: "Máx 80, default 40." },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

export function bankingWriteToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "preview_classify_bank_to_flow_row",
        description:
          "PASO 1 (obligatorio). Previsualiza clasificar un movimiento UNMATCHED a una fila de flujo por flowRowId (preferido) o flowRowName. NO persiste. Persistir flow_row_id evita ambigüedad cuando varias filas comparten accountPlanId (ej. Aporte socios vs Devolución a socios). Devuelve previewToken.",
        parameters: {
          type: "object",
          properties: {
            transactionId: { type: "string", description: "UUID del movimiento." },
            flowRowId: {
              type: "string",
              description: "UUID de FinanceFlowRow (preferido).",
            },
            flowRowName: {
              type: "string",
              description:
                "Etiqueta 'FINANCIAMIENTO · Retiro socios' o nombre 'Retiro socios'.",
            },
            note: { type: "string", description: "Nota opcional en el vínculo." },
            learnRule: {
              type: "string",
              enum: ["NONE", "RUT", "DESCRIPTION"],
              description: "Default NONE (no crea regla automatch).",
            },
            costCenter: {
              type: "object",
              description:
                "Destino de centro de costo. Omitir = sin centro. mode NONE | SINGLE | SPLIT.",
              properties: {
                mode: { type: "string", enum: ["NONE", "SINGLE", "SPLIT"] },
                installationId: {
                  type: "string",
                  description: "UUID de instalación (mode SINGLE).",
                },
                driver: {
                  type: "string",
                  enum: ["MANUAL", "EQUAL", "ACTIVE_GUARDS", "REQUIRED_GUARDS"],
                  description: "Criterio de SPLIT. Default ACTIVE_GUARDS.",
                },
                installations: {
                  type: "array",
                  maxItems: 200,
                  items: {
                    type: "object",
                    properties: {
                      installationId: { type: "string" },
                      amount: {
                        type: "number",
                        description: "Monto CLP entero. Obligatorio si driver=MANUAL.",
                      },
                    },
                    required: ["installationId"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["mode"],
              additionalProperties: false,
            },
          },
          required: ["transactionId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "classify_bank_to_flow_row",
        description:
          "PASO 2 (tras preview_classify_bank_to_flow_row Y confirmación explícita). Clasifica el movimiento a la fila: crea link INCOME|EXPENSE con flow_row_id persistido. Pasá previewToken y/o los mismos args del preview.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            transactionId: { type: "string" },
            flowRowId: { type: "string" },
            flowRowName: { type: "string" },
            note: { type: "string" },
            learnRule: {
              type: "string",
              enum: ["NONE", "RUT", "DESCRIPTION"],
            },
            costCenter: {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["NONE", "SINGLE", "SPLIT"] },
                installationId: { type: "string" },
                driver: {
                  type: "string",
                  enum: ["MANUAL", "EQUAL", "ACTIVE_GUARDS", "REQUIRED_GUARDS"],
                },
                installations: {
                  type: "array",
                  maxItems: 200,
                  items: {
                    type: "object",
                    properties: {
                      installationId: { type: "string" },
                      amount: { type: "number" },
                    },
                    required: ["installationId"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["mode"],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "preview_authorize_bank_movements",
        description:
          "PASO 1. Dry-run de Autorizar TE / bandeja «Por autorizar»: lista movimientos UNMATCHED con sugerencia (suggestedAccountPlanId) que se autorizarían. NO persiste. Filtrá por accountId/accountName y/o transactionIds. Usa authorize_bank_movements solo tras confirmación.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            accountName: { type: "string" },
            transactionIds: {
              type: "array",
              items: { type: "string" },
              description: "Si se omite, todas las pendientes de la cuenta (máx 200 en preview).",
              maxItems: 200,
            },
            from: { type: "string", description: "YYYY-MM-DD opcional." },
            to: { type: "string", description: "YYYY-MM-DD opcional." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "authorize_bank_movements",
        description:
          "PASO 2 (tras preview_authorize_bank_movements Y confirmación). Autoriza sugerencias pendientes (misma semántica que «Autorizar» en Bancos). Requiere previewToken o los mismos filtros/ids del preview.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            accountId: { type: "string" },
            accountName: { type: "string" },
            transactionIds: {
              type: "array",
              items: { type: "string" },
              maxItems: 200,
            },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

export const BANKING_PREVIEW_TO_CONFIRM: Record<
  string,
  { confirmToolName: string; label: string }
> = {
  preview_classify_bank_to_flow_row: {
    confirmToolName: "classify_bank_to_flow_row",
    label: "Clasificar movimiento a fila de flujo",
  },
  preview_authorize_bank_movements: {
    confirmToolName: "authorize_bank_movements",
    label: "Autorizar movimientos bancarios",
  },
};

export const BANKING_WRITE_TOOL_LABELS: Record<string, string> = {
  classify_bank_to_flow_row: "Clasificar movimiento a fila de flujo",
  authorize_bank_movements: "Autorizar movimientos bancarios",
};

// ── Executors ──────────────────────────────────────────────────────────────

export async function toolListBankMovements(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!requireBankingView(perms)) {
    return denied("No tienes permiso banking_view para ver cartola bancaria.");
  }

  const resolved = await resolveBankAccountId(
    tenantId,
    typeof args.accountId === "string" ? args.accountId : null,
    typeof args.accountName === "string" ? args.accountName : null,
  );
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, accounts: resolved.accounts };
  }

  const from = typeof args.from === "string" ? args.from : undefined;
  const to = typeof args.to === "string" ? args.to : undefined;
  const status = typeof args.status === "string" ? args.status : "all";
  const direction = mapDirection(
    typeof args.direction === "string" ? args.direction : undefined,
  );
  const search = typeof args.search === "string" ? args.search : undefined;
  const page = typeof args.page === "number" && args.page > 0 ? Math.floor(args.page) : 1;
  const pageSizeRaw =
    typeof args.pageSize === "number" && args.pageSize > 0 ? Math.floor(args.pageSize) : 30;
  const pageSize = Math.min(pageSizeRaw, 100);

  const [list, counts] = await Promise.all([
    listBankTransactions(tenantId, resolved.account.id, {
      dateFrom: from,
      dateTo: to,
      tab: mapBankStatusToTab(status),
      direction,
      search,
      page,
      pageSize,
    }),
    countByTabs(tenantId, resolved.account.id, from, to, direction),
  ]);

  const movements = list.transactions.map((t) => {
    const amount = Number(t.amount);
    const isPending =
      t.reconciliationStatus === "UNMATCHED" && !!t.suggestedAccountPlanId;
    const isUnrecognized =
      t.reconciliationStatus === "UNMATCHED" && !t.suggestedAccountPlanId;
    const statusKey = isPending
      ? "pending_authorize"
      : isUnrecognized
        ? "unmatched"
        : "reconciled";
    return {
      id: t.id,
      date: t.transactionDate instanceof Date
        ? t.transactionDate.toISOString().slice(0, 10)
        : String(t.transactionDate).slice(0, 10),
      amount,
      direction: amount >= 0 ? "inflow" : "outflow",
      description: t.description,
      reference: t.reference,
      reconciliationStatus: t.reconciliationStatus,
      status: statusKey,
      statusLabel:
        statusKey === "pending_authorize"
          ? "Por autorizar"
          : statusKey === "unmatched"
            ? "Sin reconocer"
            : "Conciliado",
      suggestedAccount: t.suggestedAccountLabel ?? null,
      suggestedRuleName: t.suggestedRuleName ?? null,
      flowRow: t.flowRowName ?? null,
      linkAccount: t.linkAccountLabel ?? null,
      matchSource: t.matchSource ?? null,
      url: bankTxUrl(t.id, resolved.account.id),
    };
  });

  return {
    ok: true,
    data: {
      account: resolved.account,
      filters: { from, to, status, direction, search, page, pageSize },
      counts,
      total: list.total,
      page: list.page,
      pageSize: list.pageSize,
      totalPages: list.totalPages,
      movements,
    },
  };
}

export async function toolGetBankMovement(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!requireBankingView(perms)) {
    return denied("No tienes permiso banking_view.");
  }
  const transactionId =
    typeof args.transactionId === "string" ? args.transactionId.trim() : "";
  if (!transactionId) return denied("Falta transactionId.");

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: transactionId, tenantId },
    include: {
      bankAccount: {
        select: { id: true, bankName: true, accountNumber: true },
      },
    },
  });
  if (!tx) return denied("Movimiento no encontrado.");

  const [suggestedRule, suggestedAccount, links, rawLinks, paymentRecord] =
    await Promise.all([
      tx.suggestedRuleId
        ? prisma.financeAutoMatchRule.findFirst({
            where: { id: tx.suggestedRuleId, tenantId },
            select: { id: true, name: true, action: true },
          })
        : null,
      tx.suggestedAccountPlanId
        ? prisma.financeAccountPlan.findFirst({
            where: { id: tx.suggestedAccountPlanId, tenantId },
            select: { id: true, code: true, name: true },
          })
        : null,
      listTransactionLinks(tenantId, tx.id),
      prisma.financeBankTransactionLink.findMany({
        where: { tenantId, bankTransactionId: tx.id },
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
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.financePaymentRecord.findFirst({
        where: { tenantId, bankTransactionId: tx.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          type: true,
          date: true,
          amount: true,
          status: true,
        },
      }),
    ]);

  const flowRowIds = [
    ...new Set(rawLinks.map((l) => l.flowRowId).filter((v): v is string => !!v)),
  ];
  const flowRows =
    flowRowIds.length > 0
      ? await prisma.financeFlowRow.findMany({
          where: { tenantId, id: { in: flowRowIds } },
          select: { id: true, name: true, section: true },
        })
      : [];
  const flowById = new Map(flowRows.map((r) => [r.id, r]));

  const enrichedLinks = links.map((l) => {
    const raw = rawLinks.find((r) => r.id === l.id);
    const fr = raw?.flowRowId ? flowById.get(raw.flowRowId) : null;
    return {
      id: l.id,
      targetType: l.targetType,
      targetId: l.targetId,
      amount: l.amount,
      note: l.note,
      accountPlanId: l.accountPlan?.id ?? raw?.accountPlanId ?? null,
      accountPlan: l.accountPlan,
      flowRowId: raw?.flowRowId ?? null,
      flowRow: fr
        ? { id: fr.id, name: fr.name, section: fr.section, label: `${fr.section} · ${fr.name}` }
        : null,
      entityLabel: l.entityLabel,
      dte: l.dte,
      factoring: l.factoring,
      matchSource: raw?.matchSource ?? null,
      allocations: l.allocations ?? [],
    };
  });

  const amount = Number(tx.amount);
  const isPending =
    tx.reconciliationStatus === "UNMATCHED" && !!tx.suggestedAccountPlanId;
  const isUnrecognized =
    tx.reconciliationStatus === "UNMATCHED" && !tx.suggestedAccountPlanId;

  return {
    ok: true,
    data: {
      id: tx.id,
      date: tx.transactionDate.toISOString().slice(0, 10),
      amount,
      direction: amount >= 0 ? "inflow" : "outflow",
      description: tx.description,
      reference: tx.reference,
      balance: tx.balance != null ? Number(tx.balance) : null,
      reconciliationStatus: tx.reconciliationStatus,
      status: isPending
        ? "pending_authorize"
        : isUnrecognized
          ? "unmatched"
          : "reconciled",
      bankAccount: tx.bankAccount,
      suggestedRule: suggestedRule
        ? { id: suggestedRule.id, name: suggestedRule.name }
        : null,
      suggestedAccount: suggestedAccount
        ? {
            id: suggestedAccount.id,
            code: suggestedAccount.code,
            name: suggestedAccount.name,
            label: `${suggestedAccount.code} ${suggestedAccount.name}`,
          }
        : null,
      links: enrichedLinks,
      paymentRecord: paymentRecord
        ? {
            id: paymentRecord.id,
            code: paymentRecord.code,
            type: paymentRecord.type,
            date: paymentRecord.date.toISOString().slice(0, 10),
            amount: Number(paymentRecord.amount),
            status: paymentRecord.status,
          }
        : null,
      urls: {
        bancos: bankTxUrl(tx.id, tx.bankAccountId),
        conciliacion: `/finanzas/conciliacion`,
      },
    },
  };
}

export async function toolGetBankTriageSummary(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!requireBankingView(perms)) {
    return denied("No tienes permiso banking_view.");
  }

  const resolved = await resolveBankAccountId(
    tenantId,
    typeof args.accountId === "string" ? args.accountId : null,
    typeof args.accountName === "string" ? args.accountName : null,
  );
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, accounts: resolved.accounts };
  }

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const from =
    typeof args.from === "string" && args.from.length >= 8
      ? args.from
      : defaultFrom.toISOString().slice(0, 10);
  const to =
    typeof args.to === "string" && args.to.length >= 8
      ? args.to
      : today.toISOString().slice(0, 10);
  const topN = Math.min(
    typeof args.topN === "number" && args.topN > 0 ? Math.floor(args.topN) : 8,
    20,
  );

  const counts = await countByTabs(tenantId, resolved.account.id, from, to, "all");

  const [unmatchedIn, unmatchedOut, pending] = await Promise.all([
    listBankTransactions(tenantId, resolved.account.id, {
      dateFrom: from,
      dateTo: to,
      tab: "unrecognized",
      direction: "inflow",
      page: 1,
      pageSize: topN,
      sortBy: "amount",
      sortDir: "desc",
    }),
    listBankTransactions(tenantId, resolved.account.id, {
      dateFrom: from,
      dateTo: to,
      tab: "unrecognized",
      direction: "outflow",
      page: 1,
      pageSize: topN,
      sortBy: "amount",
      sortDir: "asc",
    }),
    listBankTransactions(tenantId, resolved.account.id, {
      dateFrom: from,
      dateTo: to,
      tab: "recognized",
      page: 1,
      pageSize: topN,
    }),
  ]);

  const mapRow = (t: (typeof unmatchedIn.transactions)[number]) => ({
    id: t.id,
    date:
      t.transactionDate instanceof Date
        ? t.transactionDate.toISOString().slice(0, 10)
        : String(t.transactionDate).slice(0, 10),
    amount: Number(t.amount),
    description: t.description,
    suggestedAccount: t.suggestedAccountLabel ?? null,
    suggestedRuleName: t.suggestedRuleName ?? null,
    url: bankTxUrl(t.id, resolved.account.id),
  });

  return {
    ok: true,
    data: {
      account: resolved.account,
      from,
      to,
      counts,
      topUnmatchedInflows: unmatchedIn.transactions.map(mapRow),
      topUnmatchedOutflows: unmatchedOut.transactions.map(mapRow),
      pendingAuthorizeSample: pending.transactions.map(mapRow),
      note:
        "Socios/directores no deben sugerirse como Turnos Extras (filtro SOCIO_PICK en cascada). Para clasificar a fila usa preview_classify_bank_to_flow_row con flowRowId.",
    },
  };
}

export async function toolListFlowRows(
  tenantId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!requireBankingView(perms) && !hasCapability(perms, "cashflow_view")) {
    return denied("Necesitás banking_view o cashflow_view.");
  }

  const sectionRaw =
    typeof args.section === "string" ? args.section.trim().toUpperCase() : "";
  const SECTIONS = [
    "INGRESOS",
    "REMUNERACIONES",
    "IMPUESTOS",
    "GAV",
    "OTROS",
    "FINANCIAMIENTO",
  ] as const;
  type FlowSection = (typeof SECTIONS)[number];
  const section = SECTIONS.includes(sectionRaw as FlowSection)
    ? (sectionRaw as FlowSection)
    : null;
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const limit = Math.min(
    typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 40,
    80,
  );

  const rows = await prisma.financeFlowRow.findMany({
    where: {
      tenantId,
      archivedAt: null,
      ...(section ? { section } : {}),
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      section: true,
      canonicalKey: true,
      categoryId: true,
      accountMappings: {
        where: { isPrimary: true },
        take: 1,
        select: {
          accountPlanId: true,
          accountPlan: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: [{ section: "asc" }, { orderIndex: "asc" }],
    take: limit,
  });

  return {
    ok: true,
    data: {
      rows: rows.map((r) => {
        const primary = r.accountMappings[0];
        return {
          flowRowId: r.id,
          section: r.section,
          name: r.name,
          label: `${r.section} · ${r.name}`,
          canonicalKey: r.canonicalKey,
          hasCategory: !!r.categoryId || !!primary,
          primaryAccount: primary
            ? {
                id: primary.accountPlanId,
                code: primary.accountPlan.code,
                name: primary.accountPlan.name,
              }
            : null,
        };
      }),
    },
  };
}

type ClassifyPreviewArgs = {
  transactionId: string;
  flowRowId: string;
  flowRowLabel: string;
  accountPlanId: string;
  amountAbs: number;
  isIncome: boolean;
  note: string | null;
  learnRule: "NONE" | "RUT" | "DESCRIPTION";
  description: string;
  transactionDate: Date;
  costCenter?: CostCenterAssignment;
};

function parseCostCenterArg(
  args: Record<string, unknown>,
):
  | { ok: true; value: CostCenterAssignment | undefined }
  | { ok: false; error: string } {
  if (args.costCenter == null) return { ok: true, value: undefined };
  const parsed = costCenterAssignmentSchema.safeParse(args.costCenter);
  if (!parsed.success) {
    return {
      ok: false,
      error: "costCenter inválido. Usá mode NONE | SINGLE | SPLIT.",
    };
  }
  return { ok: true, value: parsed.data };
}

async function buildClassifyPreview(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: ClassifyPreviewArgs } | { ok: false; error: string; candidates?: unknown }> {
  const transactionId =
    typeof args.transactionId === "string" ? args.transactionId.trim() : "";
  if (!transactionId) return { ok: false, error: "Falta transactionId." };

  const rowRes = await resolveFlowRow(
    tenantId,
    typeof args.flowRowId === "string" ? args.flowRowId : null,
    typeof args.flowRowName === "string" ? args.flowRowName : null,
  );
  if (!rowRes.ok) {
    return { ok: false, error: rowRes.error, candidates: rowRes.candidates };
  }

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: transactionId, tenantId, hiddenAt: null },
    select: {
      id: true,
      amount: true,
      description: true,
      reconciliationStatus: true,
      bankAccountId: true,
      transactionDate: true,
    },
  });
  if (!tx) return { ok: false, error: "Movimiento no encontrado o oculto." };

  const existingLinks = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: tx.id },
    select: { targetType: true },
  });
  if (existingLinks.length > 0 && !canReclassifyToFlowRow(existingLinks)) {
    return {
      ok: false,
      error:
        "La transacción ya tiene vínculos de conciliación (DTE/factoring/nómina); no se sobrescribe.",
    };
  }

  const accountPlanId = await resolveAccountPlanIdForFlowRow(
    tenantId,
    { id: rowRes.row.id, categoryId: rowRes.row.categoryId },
    null,
  );
  if (!accountPlanId) {
    return {
      ok: false,
      error:
        "La fila no tiene cuenta contable asociada. Asigná categoría/cuenta en Flujo de Caja primero.",
    };
  }

  const amountAbs = Math.abs(Number(tx.amount));
  const learnRule =
    args.learnRule === "RUT" || args.learnRule === "DESCRIPTION"
      ? args.learnRule
      : "NONE";

  const cc = parseCostCenterArg(args);
  if (!cc.ok) return { ok: false, error: cc.error };

  if (
    cc.value?.mode === "SPLIT" &&
    cc.value.driver === "MANUAL"
  ) {
    const sum = cc.value.installations.reduce(
      (s, i) => s + Math.round(i.amount ?? 0),
      0,
    );
    if (sum !== Math.round(amountAbs)) {
      return {
        ok: false,
        error: `El reparto manual ($${sum.toLocaleString("es-CL")}) no cuadra con el monto del movimiento ($${Math.round(amountAbs).toLocaleString("es-CL")})`,
      };
    }
  }

  return {
    ok: true,
    data: {
      transactionId: tx.id,
      flowRowId: rowRes.row.id,
      flowRowLabel: rowRes.row.label,
      accountPlanId,
      amountAbs,
      isIncome: Number(tx.amount) > 0,
      note: typeof args.note === "string" ? args.note : null,
      learnRule,
      description: tx.description,
      transactionDate: tx.transactionDate,
      costCenter: cc.value,
    },
  };
}

export async function toolPreviewClassifyBankToFlowRow(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!requireBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_classify_bank_to_flow_row",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return denied("No tienes permiso banking_manage para clasificar movimientos.");
  }

  const built = await buildClassifyPreview(tenantId, args);
  if (!built.ok) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_classify_bank_to_flow_row",
      args,
      status: "validation_error",
      errorMessage: built.error,
      startedAt: t0,
    });
    return { ok: false, error: built.error, candidates: built.candidates };
  }

  const accountPlan = await prisma.financeAccountPlan.findFirst({
    where: { id: built.data.accountPlanId, tenantId },
    select: { code: true, name: true },
  });

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "classify_bank_to_flow_row",
    args: {
      transactionId: built.data.transactionId,
      flowRowId: built.data.flowRowId,
      note: built.data.note,
      learnRule: built.data.learnRule,
      costCenter: built.data.costCenter,
    },
    computed: { ...built.data },
  });

  const allocationPreview =
    built.data.costCenter && built.data.costCenter.mode !== "NONE"
      ? await previewCostCenterAssignment({
          tenantId,
          amountAbs: built.data.amountAbs,
          assignment: built.data.costCenter,
          refDate: built.data.transactionDate,
        })
      : { rows: [], excluded: [], total: 0 };

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_classify_bank_to_flow_row",
    args,
    status: "success",
    resultEntityId: built.data.transactionId,
    resultEntityType: "FinanceBankTransaction",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      summary: {
        transactionId: built.data.transactionId,
        description: built.data.description,
        amount: built.data.isIncome ? built.data.amountAbs : -built.data.amountAbs,
        flowRowId: built.data.flowRowId,
        flowRowLabel: built.data.flowRowLabel,
        accountPlanId: built.data.accountPlanId,
        accountPlanLabel: accountPlan
          ? `${accountPlan.code} · ${accountPlan.name}`
          : null,
        willPersistFlowRowId: true,
        learnRule: built.data.learnRule,
        note: built.data.note,
        costCenter: built.data.costCenter ?? { mode: "NONE" },
        allocationPreview: {
          rows: allocationPreview.rows,
          excluded: allocationPreview.excluded,
          total: allocationPreview.total,
        },
      },
      nextStep:
        "Mostrá el resumen al usuario. Si confirma, llamá classify_bank_to_flow_row con el previewToken (o los mismos args).",
    },
  };
}

export async function toolClassifyBankToFlowRow(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!requireBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "classify_bank_to_flow_row",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return denied("No tienes permiso banking_manage.");
  }

  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let effectiveArgs = args;
  if (token) {
    const cached = consumePreview(
      token,
      tenantId,
      userId,
      "classify_bank_to_flow_row",
    );
    if (cached) {
      effectiveArgs = { ...cached.args, ...args, previewToken: undefined };
    }
  }

  const built = await buildClassifyPreview(tenantId, effectiveArgs);
  if (!built.ok) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "classify_bank_to_flow_row",
      args: effectiveArgs,
      status: "validation_error",
      errorMessage: built.error,
      startedAt: t0,
    });
    return { ok: false, error: built.error, candidates: built.candidates };
  }

  const d = built.data;
  const result = await reclassifyTransactionToFlowRow(
    tenantId,
    d.transactionId,
    userId,
    {
      targetType: d.isIncome ? "INCOME" : "EXPENSE",
      amount: d.amountAbs,
      accountPlanId: d.accountPlanId,
      flowRowId: d.flowRowId,
      note:
        d.note ??
        `Clasificado a fila flujo: ${d.flowRowLabel} (${normalizeNameForDedupe(d.flowRowLabel)})`,
      matchSource: "MANUAL",
      costCenter: d.costCenter,
    },
  );

  // Verificación: flow_row_id quedó persistido (mismo link id si fue update).
  const link = await prisma.financeBankTransactionLink.findFirst({
    where: { tenantId, bankTransactionId: d.transactionId },
    select: { id: true, flowRowId: true, accountPlanId: true },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "classify_bank_to_flow_row",
    args: effectiveArgs,
    status: "success",
    resultEntityId: d.transactionId,
    resultEntityType: "FinanceBankTransaction",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      transactionId: d.transactionId,
      flowRowId: d.flowRowId,
      flowRowLabel: d.flowRowLabel,
      accountPlanId: d.accountPlanId,
      linkId: link?.id ?? null,
      persistedFlowRowId: link?.flowRowId ?? null,
      url: `/finanzas/bancos?txId=${d.transactionId}`,
    },
  };
}

type AuthorizePreviewArgs = {
  bankAccountId: string | null;
  transactionIds: string[];
};

async function buildAuthorizeCandidates(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      account: { id: string; bankName: string; accountNumber: string } | null;
      filters: AuthorizePreviewArgs;
      candidates: Array<{
        id: string;
        date: string;
        amount: number;
        description: string;
        suggestedAccount: string | null;
        suggestedRuleName: string | null;
      }>;
    }
  | { ok: false; error: string; accounts?: unknown }
> {
  let bankAccountId: string | null = null;
  let account: { id: string; bankName: string; accountNumber: string } | null =
    null;

  const hasAccountHint =
    (typeof args.accountId === "string" && args.accountId.trim()) ||
    (typeof args.accountName === "string" && args.accountName.trim());

  if (hasAccountHint) {
    const resolved = await resolveBankAccountId(
      tenantId,
      typeof args.accountId === "string" ? args.accountId : null,
      typeof args.accountName === "string" ? args.accountName : null,
    );
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, accounts: resolved.accounts };
    }
    bankAccountId = resolved.account.id;
    account = resolved.account;
  }

  const txIds = Array.isArray(args.transactionIds)
    ? args.transactionIds
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];

  const from = typeof args.from === "string" ? args.from : undefined;
  const to = typeof args.to === "string" ? args.to : undefined;

  const where: Prisma.FinanceBankTransactionWhereInput = {
    tenantId,
    reconciliationStatus: "UNMATCHED",
    hiddenAt: null,
    suggestedAccountPlanId: { not: null },
  };
  if (bankAccountId) where.bankAccountId = bankAccountId;
  if (txIds.length > 0) where.id = { in: txIds };
  if (from || to) {
    where.transactionDate = {};
    if (from) (where.transactionDate as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.transactionDate as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const rows = await prisma.financeBankTransaction.findMany({
    where,
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      suggestedAccountPlanId: true,
      suggestedRuleId: true,
      bankAccountId: true,
    },
    orderBy: { transactionDate: "desc" },
    take: 200,
  });

  const accountIds = [
    ...new Set(
      rows
        .map((r) => r.suggestedAccountPlanId)
        .filter((v): v is string => !!v),
    ),
  ];
  const ruleIds = [
    ...new Set(rows.map((r) => r.suggestedRuleId).filter((v): v is string => !!v)),
  ];
  const [plans, rules] = await Promise.all([
    accountIds.length
      ? prisma.financeAccountPlan.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        })
      : [],
    ruleIds.length
      ? prisma.financeAutoMatchRule.findMany({
          where: { tenantId, id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const planMap = new Map(plans.map((p) => [p.id, `${p.code} · ${p.name}`]));
  const ruleMap = new Map(rules.map((r) => [r.id, r.name]));

  return {
    ok: true,
    account,
    filters: {
      bankAccountId,
      transactionIds: rows.map((r) => r.id),
    },
    candidates: rows.map((r) => ({
      id: r.id,
      date: r.transactionDate.toISOString().slice(0, 10),
      amount: Number(r.amount),
      description: r.description,
      suggestedAccount: r.suggestedAccountPlanId
        ? planMap.get(r.suggestedAccountPlanId) ?? null
        : null,
      suggestedRuleName: r.suggestedRuleId
        ? ruleMap.get(r.suggestedRuleId) ?? null
        : null,
    })),
  };
}

export async function toolPreviewAuthorizeBankMovements(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!requireBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_authorize_bank_movements",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return denied("No tienes permiso banking_manage para autorizar.");
  }

  const built = await buildAuthorizeCandidates(tenantId, args);
  if (!built.ok) {
    return { ok: false, error: built.error, accounts: built.accounts };
  }

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "authorize_bank_movements",
    args: {
      accountId: built.filters.bankAccountId,
      transactionIds: built.filters.transactionIds,
    },
    computed: {
      count: built.candidates.length,
      totalAmount: built.candidates.reduce((s, c) => s + c.amount, 0),
    },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_authorize_bank_movements",
    args,
    status: "success",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      dryRun: true,
      account: built.account,
      count: built.candidates.length,
      totalAmount: built.candidates.reduce((s, c) => s + c.amount, 0),
      candidates: built.candidates,
      nextStep:
        "Esto es dry-run. Mostrá el conteo/lista. Solo si el usuario confirma, llamá authorize_bank_movements con el previewToken.",
    },
  };
}

export async function toolAuthorizeBankMovements(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!requireBankingManage(perms)) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "authorize_bank_movements",
      args,
      status: "denied",
      errorMessage: "Sin banking_manage",
      startedAt: t0,
    });
    return denied("No tienes permiso banking_manage.");
  }

  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let bankAccountId: string | undefined;
  let txIds: string[] | undefined;

  if (token) {
    const cached = consumePreview(
      token,
      tenantId,
      userId,
      "authorize_bank_movements",
    );
    if (cached) {
      bankAccountId =
        typeof cached.args.accountId === "string"
          ? cached.args.accountId
          : undefined;
      txIds = Array.isArray(cached.args.transactionIds)
        ? (cached.args.transactionIds as string[])
        : undefined;
    }
  }

  if (!txIds && Array.isArray(args.transactionIds)) {
    txIds = args.transactionIds.filter((x): x is string => typeof x === "string");
  }
  if (!bankAccountId) {
    if (typeof args.accountId === "string" && args.accountId) {
      bankAccountId = args.accountId;
    } else if (typeof args.accountName === "string" && args.accountName) {
      const resolved = await resolveBankAccountId(tenantId, null, args.accountName);
      if (!resolved.ok) {
        return { ok: false, error: resolved.error, accounts: resolved.accounts };
      }
      bankAccountId = resolved.account.id;
    }
  }

  if ((!txIds || txIds.length === 0) && !bankAccountId) {
    return denied(
      "Pasá previewToken, transactionIds o accountId/accountName. Sin filtros no se autoriza en masa todo el tenant por seguridad.",
    );
  }

  const result = await confirmAllSuggestions(tenantId, userId, {
    bankAccountId,
    txIds,
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "authorize_bank_movements",
    args: { bankAccountId, txIdsCount: txIds?.length ?? null },
    status: "success",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      confirmed: result.confirmed,
      bankAccountId: bankAccountId ?? null,
      requestedIds: txIds?.length ?? null,
    },
  };
}
