import "server-only";
import { prisma } from "@/lib/prisma";
import type { FlowRowKey } from "@prisma/client";
import { bulkAccountToRow } from "@/modules/finance/flow-v3/rowAccount.service";
import type { FlowRowDest } from "./flow-classify.service";

/**
 * Resuelve las filas canónicas de remuneraciones usadas por la cascada.
 * Preferencia: canonicalKey; sin fallback por nombre.
 */
export async function resolvePayrollFlowRows(tenantId: string): Promise<{
  liquidacionRow: FlowRowDest | null;
  anticipoRow: FlowRowDest | null;
  finiquitoRow: FlowRowDest | null;
  teRow: FlowRowDest | null;
  retiroSocioRow: FlowRowDest | null;
  devolPrestamoSocioRow: FlowRowDest | null;
}> {
  const keys: FlowRowKey[] = [
    "SUELDO",
    "QUINCENA",
    "FINIQUITO",
    "TURNO_EXTRA",
    "RETIRO_SOCIO",
    "DEVOL_PRESTAMO_SOCIO",
  ];
  const rows = await prisma.financeFlowRow.findMany({
    where: {
      tenantId,
      archivedAt: null,
      canonicalKey: { in: keys },
    },
    select: {
      id: true,
      name: true,
      canonicalKey: true,
    },
  });

  const byKey = new Map<FlowRowKey, FlowRowDest>();
  for (const r of rows) {
    if (!r.canonicalKey || byKey.has(r.canonicalKey)) continue;
    byKey.set(r.canonicalKey, { flowRowId: r.id, label: r.name });
  }

  return {
    liquidacionRow: byKey.get("SUELDO") ?? null,
    anticipoRow: byKey.get("QUINCENA") ?? null,
    finiquitoRow: byKey.get("FINIQUITO") ?? null,
    teRow: byKey.get("TURNO_EXTRA") ?? null,
    retiroSocioRow: byKey.get("RETIRO_SOCIO") ?? null,
    devolPrestamoSocioRow: byKey.get("DEVOL_PRESTAMO_SOCIO") ?? null,
  };
}

/**
 * Proveedor → cuenta de gasto → renglón destino por defecto.
 */
export async function resolveSupplierCategoryRow(
  tenantId: string,
  supplierId: string,
): Promise<{ row: FlowRowDest; categoryName: string } | null> {
  const supplier = await prisma.financeSupplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { accountExpenseId: true, name: true },
  });
  if (!supplier?.accountExpenseId) return null;

  const accountToRow = await bulkAccountToRow(tenantId, [
    supplier.accountExpenseId,
  ]);
  const rowId = accountToRow.get(supplier.accountExpenseId);
  if (!rowId) return null;

  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!row) return null;

  return {
    row: { flowRowId: row.id, label: row.name },
    categoryName: row.name,
  };
}
