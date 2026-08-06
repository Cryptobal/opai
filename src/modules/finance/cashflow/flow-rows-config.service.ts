/**
 * Configuración de renglones del flujo (vista de configuración).
 * Lista filas activas con su categoría y cuentas contables asociadas.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { listMappingsForCategory } from "./categoryAccount.service";
import { getFlowHealth } from "./flow-health.service";
import type { FlowHealthReport } from "./flow-health.types";

export interface FlowRowConfigItem {
  id: string;
  name: string;
  section: string;
  mapping: string;
  orderIndex: number;
  archivedAt: string | null;
  category: {
    id: string;
    code: string;
    name: string;
    kind: "INCOME" | "EXPENSE";
    isActive: boolean;
    accounts: Array<{ id: string; code: string; name: string; isPrimary: boolean }>;
  } | null;
}

export interface FlowRowsConfigPayload {
  rows: FlowRowConfigItem[];
  health: FlowHealthReport;
}

export async function getFlowRowsConfig(
  tenantId: string,
): Promise<FlowRowsConfigPayload> {
  const [rows, health] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: [{ section: "asc" }, { orderIndex: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        section: true,
        mapping: true,
        orderIndex: true,
        archivedAt: true,
        categoryId: true,
      },
    }),
    getFlowHealth(tenantId),
  ]);

  const categoryIds = [
    ...new Set(rows.map((r) => r.categoryId).filter((id): id is string => !!id)),
  ];
  const categories =
    categoryIds.length === 0
      ? []
      : await prisma.financeCashflowCategory.findMany({
          where: { tenantId, id: { in: categoryIds } },
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
            isActive: true,
          },
        });
  const catById = new Map(categories.map((c) => [c.id, c]));

  const mappingsByCat = new Map<
    string,
    Array<{ id: string; code: string; name: string; isPrimary: boolean }>
  >();
  await Promise.all(
    categoryIds.map(async (catId) => {
      const mappings = await listMappingsForCategory(tenantId, catId);
      mappingsByCat.set(
        catId,
        mappings.map((m) => ({
          id: m.accountPlanId,
          code: m.accountPlan.code,
          name: m.accountPlan.name,
          isPrimary: m.isPrimary,
        })),
      );
    }),
  );

  const items: FlowRowConfigItem[] = rows.map((r) => {
    const cat = r.categoryId ? catById.get(r.categoryId) : null;
    return {
      id: r.id,
      name: r.name,
      section: r.section,
      mapping: r.mapping,
      orderIndex: r.orderIndex,
      archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
      category: cat
        ? {
            id: cat.id,
            code: cat.code,
            name: cat.name,
            kind: cat.kind as "INCOME" | "EXPENSE",
            isActive: cat.isActive,
            accounts: mappingsByCat.get(cat.id) ?? [],
          }
        : null,
    };
  });

  return { rows: items, health };
}

export async function patchFlowRowConfig(
  tenantId: string,
  rowId: string,
  patch: { name?: string; categoryId?: string | null },
) {
  const { updateRow } = await import("@/modules/finance/flow-v3/rows.service");
  if (patch.categoryId === null) {
    return updateRow(tenantId, rowId, {
      name: patch.name,
      mapping: "MANUAL",
    });
  }
  return updateRow(tenantId, rowId, {
    name: patch.name,
    categoryId: patch.categoryId,
    mapping: patch.categoryId ? "CATEGORY" : undefined,
  });
}
