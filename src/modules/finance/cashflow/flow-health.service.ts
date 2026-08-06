import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  FlowHealthLookup,
  FlowHealthReport,
} from "./flow-health.types";

export type { FlowHealthLookup, FlowHealthReport } from "./flow-health.types";

/**
 * Diagnóstico de la cadena fila ↔ categoría ↔ cuenta del flujo de caja.
 * Solo lecturas, siempre filtradas por tenantId.
 */
export async function getFlowHealth(
  tenantId: string,
  lookup?: FlowHealthLookup,
): Promise<FlowHealthReport> {
  const [rows, categories, mappings] = await Promise.all([
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
        categoryId: true,
      },
      orderBy: [{ section: "asc" }, { orderIndex: "asc" }],
    }),
    prisma.financeCashflowCategory.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        accountPlanId: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.financeCashflowCategoryAccount.findMany({
      where: {
        tenantId,
        ...(lookup?.accountPlanId
          ? { accountPlanId: lookup.accountPlanId }
          : {}),
      },
      select: {
        categoryId: true,
        accountPlanId: true,
        isPrimary: true,
        accountPlan: {
          select: { id: true, code: true, name: true, type: true },
        },
        category: { select: { id: true, name: true, kind: true } },
      },
    }),
  ]);

  const categoryIdsUsedByRows = new Set(
    rows.map((r) => r.categoryId).filter((id): id is string => !!id),
  );

  const accountsByCategory = new Map<
    string,
    Array<{ code: string; name: string }>
  >();
  for (const m of mappings) {
    const list = accountsByCategory.get(m.categoryId) ?? [];
    list.push({ code: m.accountPlan.code, name: m.accountPlan.name });
    accountsByCategory.set(m.categoryId, list);
  }
  // Legacy: accountPlanId directo en la categoría si no hay mappings N:M.
  const legacyAccountIds = categories
    .filter((c) => !accountsByCategory.has(c.id) && c.accountPlanId)
    .map((c) => c.accountPlanId as string);
  if (legacyAccountIds.length > 0) {
    const legacyAccounts = await prisma.financeAccountPlan.findMany({
      where: { tenantId, id: { in: legacyAccountIds } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(legacyAccounts.map((a) => [a.id, a]));
    for (const cat of categories) {
      if (accountsByCategory.has(cat.id) || !cat.accountPlanId) continue;
      const ap = byId.get(cat.accountPlanId);
      if (ap) accountsByCategory.set(cat.id, [{ code: ap.code, name: ap.name }]);
    }
  }

  const rowsWithoutCategory = rows
    .filter(
      (r) =>
        !r.categoryId &&
        r.section !== "INGRESOS" &&
        // Fallbacks de bandeja no necesitan categoría (son el catch-all).
        r.name !== "Otros egresos" &&
        r.name !== "Otros ingresos",
    )
    .map((r) => ({ id: r.id, name: r.name, section: r.section }));

  const expenseCategories = categories.filter((c) => c.kind === "EXPENSE");
  const categoriesWithoutRow = expenseCategories
    .filter((c) => !categoryIdsUsedByRows.has(c.id))
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      accounts: accountsByCategory.get(c.id) ?? [],
    }));

  // Cuentas usadas por más de una categoría.
  const catsByAccount = new Map<
    string,
    { code: string; name: string; categories: Array<{ id: string; name: string }> }
  >();
  for (const m of mappings) {
    const entry = catsByAccount.get(m.accountPlanId) ?? {
      code: m.accountPlan.code,
      name: m.accountPlan.name,
      categories: [],
    };
    if (!entry.categories.some((c) => c.id === m.category.id)) {
      entry.categories.push({ id: m.category.id, name: m.category.name });
    }
    catsByAccount.set(m.accountPlanId, entry);
  }
  const ambiguousAccounts = [...catsByAccount.entries()]
    .filter(([, v]) => v.categories.length > 1)
    .map(([accountPlanId, v]) => ({
      accountPlanId,
      code: v.code,
      name: v.name,
      categories: v.categories,
    }));

  const expenseCategoriesOnNonExpenseAccounts: FlowHealthReport["expenseCategoriesOnNonExpenseAccounts"] =
    [];
  for (const m of mappings) {
    if (m.category.kind !== "EXPENSE") continue;
    const t = m.accountPlan.type;
    if (t === "ASSET" || t === "LIABILITY") {
      expenseCategoriesOnNonExpenseAccounts.push({
        categoryId: m.category.id,
        categoryName: m.category.name,
        accountCode: m.accountPlan.code,
        accountName: m.accountPlan.name,
        accountType: t,
      });
    }
  }

  // Fila conectada: tiene categoría y esa categoría tiene al menos una cuenta.
  let connectedRowCount = 0;
  for (const r of rows) {
    if (!r.categoryId) continue;
    const accs = accountsByCategory.get(r.categoryId);
    if (accs && accs.length > 0) connectedRowCount += 1;
  }

  return {
    rowsWithoutCategory,
    categoriesWithoutRow,
    ambiguousAccounts,
    expenseCategoriesOnNonExpenseAccounts,
    connectedRowCount,
  };
}

/**
 * Cadena derivada para un destino puntual (cuenta o fila).
 * Usado por los editores de regla sin recargar el reporte completo.
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
    if (!fr.categoryId) {
      warnings.push("la fila no puede recibir movimientos");
    } else {
      const cat = await prisma.financeCashflowCategory.findFirst({
        where: { id: fr.categoryId, tenantId },
        select: { id: true, code: true, name: true, kind: true },
      });
      if (cat) {
        category = cat;
        const primary = await prisma.financeCashflowCategoryAccount.findFirst({
          where: { tenantId, categoryId: cat.id },
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
        }
      }
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
    const mapping = await prisma.financeCashflowCategoryAccount.findFirst({
      where: { tenantId, accountPlanId: ap.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        category: {
          select: { id: true, code: true, name: true, kind: true },
        },
      },
    });
    if (mapping) {
      category = mapping.category;
      const fr = await prisma.financeFlowRow.findFirst({
        where: {
          tenantId,
          categoryId: mapping.category.id,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          section: true,
          mapping: true,
        },
      });
      if (fr) {
        row = fr;
      } else {
        warnings.push(
          "el movimiento se contabiliza pero en el flujo sigue cayendo en Otros egresos",
        );
      }
      if (
        mapping.category.kind === "EXPENSE" &&
        (ap.type === "ASSET" || ap.type === "LIABILITY")
      ) {
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
