import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCategoryFromAccount } from "@/modules/finance/cashflow/categoryAccount.service";
import type { FlowRowDest } from "./flow-classify.service";

/**
 * Resuelve las filas canónicas de remuneraciones usadas por la cascada.
 * Preferencia: categoryCode de sistema; fallback por nombre.
 */
export async function resolvePayrollFlowRows(tenantId: string): Promise<{
  liquidacionRow: FlowRowDest | null;
  anticipoRow: FlowRowDest | null;
  finiquitoRow: FlowRowDest | null;
  teRow: FlowRowDest | null;
}> {
  const [rows, categories] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: {
        tenantId,
        archivedAt: null,
        section: "REMUNERACIONES",
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
      },
    }),
    prisma.financeCashflowCategory.findMany({
      where: {
        tenantId,
        code: {
          in: ["EGR_SUELDO", "EGR_QUINCENA", "EGR_FINIQUITO", "EGR_TURNO_EXTRA"],
        },
      },
      select: { id: true, code: true },
    }),
  ]);

  const catIdByCode = new Map(categories.map((c) => [c.code, c.id]));
  const byCategoryId = new Map<string, FlowRowDest>();
  const byName = new Map<string, FlowRowDest>();
  for (const r of rows) {
    const dest = { flowRowId: r.id, label: r.name };
    if (r.categoryId && !byCategoryId.has(r.categoryId)) {
      byCategoryId.set(r.categoryId, dest);
    }
    byName.set(r.name.trim().toLowerCase(), dest);
  }

  const pick = (code: string, names: string[]): FlowRowDest | null => {
    const catId = catIdByCode.get(code);
    if (catId) {
      const byCat = byCategoryId.get(catId);
      if (byCat) return byCat;
    }
    for (const n of names) {
      const hit = byName.get(n);
      if (hit) return hit;
    }
    return null;
  };

  return {
    liquidacionRow: pick("EGR_SUELDO", [
      "sueldos líquidos",
      "sueldos liquidos",
      "sueldos",
    ]),
    anticipoRow: pick("EGR_QUINCENA", [
      "quincena (anticipos)",
      "quincenas / anticipos",
      "quincena",
      "anticipos",
    ]),
    finiquitoRow: pick("EGR_FINIQUITO", ["finiquitos", "finiquito"]),
    teRow: pick("EGR_TURNO_EXTRA", [
      "turnos extra",
      "turno extra",
      "pago turnos extra",
    ]),
  };
}

/**
 * Categoría habitual del proveedor vía accountExpenseId → categoría → fila.
 */
export async function resolveSupplierCategoryRow(
  tenantId: string,
  supplierId: string,
): Promise<{ row: FlowRowDest; categoryName: string } | null> {
  const supplier = await prisma.financeSupplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { accountExpenseId: true },
  });
  if (!supplier?.accountExpenseId) return null;

  const category = await resolveCategoryFromAccount(
    tenantId,
    supplier.accountExpenseId,
  );
  if (!category) return null;

  const row = await prisma.financeFlowRow.findFirst({
    where: {
      tenantId,
      archivedAt: null,
      categoryId: category.id,
    },
    select: { id: true, name: true },
    orderBy: { orderIndex: "asc" },
  });
  if (!row) return null;

  return {
    row: { flowRowId: row.id, label: row.name },
    categoryName: category.name,
  };
}
