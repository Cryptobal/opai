import "server-only";
import { prisma } from "@/lib/prisma";

type FlowRowAccountRef = {
  id?: string;
  categoryId: string | null;
  parentId?: string | null;
};

async function resolveOwnAccountPlanId(
  tenantId: string,
  row: FlowRowAccountRef,
): Promise<string | null> {
  if (row.id) {
    const primary = await prisma.financeFlowRowAccount.findFirst({
      where: { tenantId, rowId: row.id, isPrimary: true },
      select: { accountPlanId: true },
    });
    if (primary) return primary.accountPlanId;

    const any = await prisma.financeFlowRowAccount.findFirst({
      where: { tenantId, rowId: row.id },
      orderBy: { createdAt: "asc" },
      select: { accountPlanId: true },
    });
    if (any) return any.accountPlanId;
  }

  // Fallback legacy: categoría vinculada (pre-backfill / espejo).
  if (!row.categoryId) return null;
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { id: row.categoryId, tenantId },
    select: {
      accountPlanId: true,
      accountMappings: {
        select: { accountPlanId: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
  });
  return cat?.accountMappings[0]?.accountPlanId ?? cat?.accountPlanId ?? null;
}

/**
 * Resuelve accountPlanId desde las cuentas del renglón.
 * Precedencia: override → isPrimary del renglón → categoría legacy (espejo)
 * → cuentas de la categoría padre (las subfilas no tienen cuentas propias).
 */
export async function resolveAccountPlanIdForFlowRow(
  tenantId: string,
  row: FlowRowAccountRef,
  overrideAccountPlanId?: string | null,
): Promise<string | null> {
  if (overrideAccountPlanId) return overrideAccountPlanId;

  const own = await resolveOwnAccountPlanId(tenantId, row);
  if (own) return own;
  if (!row.parentId) return null;

  const parent = await prisma.financeFlowRow.findFirst({
    where: { id: row.parentId, tenantId, archivedAt: null },
    select: { id: true, categoryId: true },
  });
  if (!parent) return null;
  return resolveOwnAccountPlanId(tenantId, parent);
}
