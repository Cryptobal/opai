import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceCashflowCategory } from "@prisma/client";

export interface MappingWithAccount {
  id: string;
  accountPlanId: string;
  isPrimary: boolean;
  createdAt: Date;
  accountPlan: { code: string; name: string };
}

export async function listMappingsForCategory(
  tenantId: string,
  categoryId: string,
): Promise<MappingWithAccount[]> {
  const rows = await prisma.financeCashflowCategoryAccount.findMany({
    where: { tenantId, categoryId },
    include: { accountPlan: { select: { code: true, name: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    accountPlanId: r.accountPlanId,
    isPrimary: r.isPrimary,
    createdAt: r.createdAt,
    accountPlan: r.accountPlan,
  }));
}

/**
 * Reemplaza todos los mappings de una categoría por la lista entregada.
 * El primer accountPlanId del arreglo queda como `isPrimary=true`.
 *
 * Operación atómica: si falla, no quedan mappings huérfanos. La transacción
 * primero borra todos los mappings existentes y luego inserta los nuevos en
 * orden. El borrado previo es necesario para no chocar con la unique
 * `uq_cashflow_cat_account_primary` cuando se re-ordena el primary.
 */
export async function setMappingsForCategory(
  tenantId: string,
  categoryId: string,
  accountPlanIds: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.financeCashflowCategoryAccount.deleteMany({
      where: { tenantId, categoryId },
    });
    for (let i = 0; i < accountPlanIds.length; i++) {
      await tx.financeCashflowCategoryAccount.create({
        data: {
          tenantId,
          categoryId,
          accountPlanId: accountPlanIds[i],
          isPrimary: i === 0,
        },
      });
    }
  });
}

/**
 * Dada una cuenta contable, devuelve la categoría de cashflow que la agrupa.
 * Si más de una categoría mapea a la misma cuenta, prefiere la que la tenga
 * marcada como `isPrimary`. La unique parcial garantiza determinismo.
 */
export async function resolveCategoryFromAccount(
  tenantId: string,
  accountPlanId: string,
): Promise<FinanceCashflowCategory | null> {
  const mapping = await prisma.financeCashflowCategoryAccount.findFirst({
    where: { tenantId, accountPlanId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { category: true },
  });
  return mapping?.category ?? null;
}

/**
 * Bulk: para una lista de accountPlanIds, devuelve un Map accountPlanId →
 * FinanceCashflowCategory. Optimizado para usar dentro del matcher.
 */
export async function bulkResolveCategoriesFromAccounts(
  tenantId: string,
  accountPlanIds: string[],
): Promise<Map<string, FinanceCashflowCategory>> {
  if (accountPlanIds.length === 0) return new Map();
  const mappings = await prisma.financeCashflowCategoryAccount.findMany({
    where: { tenantId, accountPlanId: { in: accountPlanIds } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { category: true },
  });
  const result = new Map<string, FinanceCashflowCategory>();
  for (const m of mappings) {
    if (!result.has(m.accountPlanId)) {
      result.set(m.accountPlanId, m.category);
    }
  }
  return result;
}

/**
 * Dada una lista de accountPlanIds, devuelve aquellos que NO tienen mapping
 * a ninguna categoría de cashflow. Sirve para detectar después de un link
 * a qué cuentas hay que pedir mapping al usuario.
 */
export async function findUnmappedAccounts(
  tenantId: string,
  accountPlanIds: string[],
): Promise<Array<{ id: string; code: string; name: string }>> {
  if (accountPlanIds.length === 0) return [];
  const mapped = await prisma.financeCashflowCategoryAccount.findMany({
    where: { tenantId, accountPlanId: { in: accountPlanIds } },
    select: { accountPlanId: true },
  });
  const mappedSet = new Set(mapped.map((m) => m.accountPlanId));
  const unmappedIds = accountPlanIds.filter((id) => !mappedSet.has(id));
  if (unmappedIds.length === 0) return [];
  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId, id: { in: unmappedIds } },
    select: { id: true, code: true, name: true },
  });
  return accounts;
}
