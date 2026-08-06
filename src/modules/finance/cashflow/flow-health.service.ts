import "server-only";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROW_KEYS, isBandejaKey } from "@/modules/finance/flow-v3/row-keys";
import type {
  FlowHealthLookup,
  FlowHealthReport,
} from "./flow-health.types";

export type { FlowHealthLookup, FlowHealthReport } from "./flow-health.types";

/**
 * Diagnóstico de la cadena renglón ↔ cuentas del flujo de caja.
 * Solo lecturas, siempre filtradas por tenantId.
 */
export async function getFlowHealth(
  tenantId: string,
  lookup?: FlowHealthLookup,
): Promise<FlowHealthReport> {
  const [rows, mappings, activeAccounts] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: {
        tenantId,
        archivedAt: null,
        ...(lookup?.flowRowId ? { id: lookup.flowRowId } : {}),
      },
      select: {
        id: true,
        name: true,
        section: true,
        mapping: true,
        canonicalKey: true,
      },
      orderBy: [{ section: "asc" }, { orderIndex: "asc" }],
    }),
    prisma.financeFlowRowAccount.findMany({
      where: {
        tenantId,
        ...(lookup?.accountPlanId
          ? { accountPlanId: lookup.accountPlanId }
          : {}),
        row: { archivedAt: null },
      },
      select: {
        rowId: true,
        accountPlanId: true,
        isPrimary: true,
        isDefaultTarget: true,
        accountPlan: {
          select: { id: true, code: true, name: true, type: true },
        },
        row: {
          select: { id: true, name: true, section: true, canonicalKey: true },
        },
      },
    }),
    prisma.financeAccountPlan.findMany({
      where: {
        tenantId,
        isActive: true,
        acceptsEntries: true,
        type: { in: ["EXPENSE", "COST"] },
      },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const accountsByRow = new Map<string, typeof mappings>();
  for (const m of mappings) {
    const list = accountsByRow.get(m.rowId) ?? [];
    list.push(m);
    accountsByRow.set(m.rowId, list);
  }

  const rowsWithoutAccounts = rows
    .filter((r) => {
      if (r.section === "INGRESOS" || r.section === "OTROS") return false;
      if (isBandejaKey(r.canonicalKey)) return false;
      if (r.mapping === "ACCOUNT_INSTALLATION" || r.mapping === "SUPPLIER") {
        return false;
      }
      return !(accountsByRow.get(r.id)?.length);
    })
    .map((r) => ({ id: r.id, name: r.name, section: r.section }));

  const mappedAccountIds = new Set(mappings.map((m) => m.accountPlanId));
  const accountsWithoutRow = activeAccounts
    .filter((a) => !mappedAccountIds.has(a.id))
    .map((a) => ({
      accountPlanId: a.id,
      code: a.code,
      name: a.name,
    }));

  const byAccount = new Map<string, typeof mappings>();
  for (const m of mappings) {
    const list = byAccount.get(m.accountPlanId) ?? [];
    list.push(m);
    byAccount.set(m.accountPlanId, list);
  }

  const sharedAccountsWithoutDefault: FlowHealthReport["sharedAccountsWithoutDefault"] =
    [];
  for (const [accountPlanId, list] of byAccount) {
    if (list.length < 2) continue;
    if (list.some((m) => m.isDefaultTarget)) continue;
    sharedAccountsWithoutDefault.push({
      accountPlanId,
      code: list[0].accountPlan.code,
      name: list[0].accountPlan.name,
      rows: list.map((m) => ({
        id: m.row.id,
        name: m.row.name,
        section: m.row.section,
      })),
    });
  }

  const keyGroups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.canonicalKey) continue;
    const list = keyGroups.get(r.canonicalKey) ?? [];
    list.push(r);
    keyGroups.set(r.canonicalKey, list);
  }
  const duplicateCanonicalKeys = [...keyGroups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      rows: list.map((r) => ({
        id: r.id,
        name: r.name,
        section: r.section,
      })),
    }));

  const expenseRowsOnNonExpenseAccounts: FlowHealthReport["expenseRowsOnNonExpenseAccounts"] =
    [];
  for (const m of mappings) {
    const section = m.row.section;
    if (section === "INGRESOS" || section === "OTROS") continue;
    const t = m.accountPlan.type;
    if (t === "ASSET" || t === "LIABILITY") {
      expenseRowsOnNonExpenseAccounts.push({
        rowId: m.row.id,
        rowName: m.row.name,
        accountCode: m.accountPlan.code,
        accountName: m.accountPlan.name,
        accountType: t,
      });
    }
  }

  const presentKeys = new Set(
    rows.map((r) => r.canonicalKey).filter((k): k is NonNullable<typeof k> => !!k),
  );
  const missingSystemKeys = [...SYSTEM_ROW_KEYS].filter((k) => !presentKeys.has(k));

  let connectedRowCount = 0;
  for (const r of rows) {
    if (r.section === "INGRESOS" || isBandejaKey(r.canonicalKey)) continue;
    const accs = accountsByRow.get(r.id);
    if ((accs && accs.length > 0) || r.canonicalKey) connectedRowCount += 1;
  }

  void rowById;

  return {
    rowsWithoutAccounts,
    accountsWithoutRow,
    sharedAccountsWithoutDefault,
    duplicateCanonicalKeys,
    expenseRowsOnNonExpenseAccounts,
    missingSystemKeys,
    connectedRowCount,
    ambiguousAccounts: sharedAccountsWithoutDefault,
  };
}

/**
 * Cadena derivada para un destino puntual (cuenta o fila).
 */
export async function getFlowDestinationChain(
  tenantId: string,
  opts: { accountPlanId?: string; flowRowId?: string },
): Promise<{
  account: { id: string; code: string; name: string; type: string } | null;
  category: { id: string; code: string; name: string; kind: string } | null;
  row: { id: string; name: string; section: string; mapping: string } | null;
  warnings: string[];
}> {
  const warnings: string[] = [];
  let account: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null = null;
  let category: {
    id: string;
    code: string;
    name: string;
    kind: string;
  } | null = null;
  let row: {
    id: string;
    name: string;
    section: string;
    mapping: string;
  } | null = null;

  if (opts.flowRowId) {
    const fr = await prisma.financeFlowRow.findFirst({
      where: { id: opts.flowRowId, tenantId, archivedAt: null },
      select: {
        id: true,
        name: true,
        section: true,
        mapping: true,
        categoryId: true,
        canonicalKey: true,
      },
    });
    if (!fr) {
      warnings.push("→ fila no encontrada");
      return { account, category, row, warnings };
    }
    row = {
      id: fr.id,
      name: fr.name,
      section: fr.section,
      mapping: fr.mapping,
    };
    const primary = await prisma.financeFlowRowAccount.findFirst({
      where: { tenantId, rowId: fr.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        accountPlan: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });
    if (primary) {
      account = {
        id: primary.accountPlan.id,
        code: primary.accountPlan.code,
        name: primary.accountPlan.name,
        type: primary.accountPlan.type,
      };
    } else if (!fr.canonicalKey) {
      warnings.push("el renglón no tiene cuentas; lo pagado cae en Otros egresos");
    }
    if (fr.categoryId) {
      const cat = await prisma.financeCashflowCategory.findFirst({
        where: { id: fr.categoryId, tenantId },
        select: { id: true, code: true, name: true, kind: true },
      });
      if (cat) category = cat;
    }
  } else if (opts.accountPlanId) {
    const ap = await prisma.financeAccountPlan.findFirst({
      where: { id: opts.accountPlanId, tenantId },
      select: { id: true, code: true, name: true, type: true },
    });
    if (!ap) {
      warnings.push("→ cuenta no encontrada");
      return { account, category, row, warnings };
    }
    account = ap;

    const mapping = await prisma.financeFlowRowAccount.findFirst({
      where: { tenantId, accountPlanId: ap.id, row: { archivedAt: null } },
      orderBy: [{ isDefaultTarget: "desc" }, { createdAt: "asc" }],
      select: {
        isDefaultTarget: true,
        row: {
          select: {
            id: true,
            name: true,
            section: true,
            mapping: true,
            categoryId: true,
          },
        },
      },
    });
    if (mapping) {
      row = mapping.row;
      if (!mapping.isDefaultTarget) {
        const siblings = await prisma.financeFlowRowAccount.count({
          where: {
            tenantId,
            accountPlanId: ap.id,
            row: { archivedAt: null },
          },
        });
        if (siblings > 1) {
          warnings.push(
            "esta cuenta alimenta varios renglones; elegí cuál recibe los cargos sin origen identificado",
          );
        }
      }
      if (mapping.row.categoryId) {
        const cat = await prisma.financeCashflowCategory.findFirst({
          where: { id: mapping.row.categoryId, tenantId },
          select: { id: true, code: true, name: true, kind: true },
        });
        if (cat) category = cat;
      }
      if (ap.type === "ASSET" || ap.type === "LIABILITY") {
        warnings.push("el gasto no llegará al Estado de Resultados");
      }
    } else {
      warnings.push(
        "el movimiento se contabiliza pero en el flujo sigue cayendo en Otros egresos",
      );
    }
  }

  return { account, category, row, warnings };
}
