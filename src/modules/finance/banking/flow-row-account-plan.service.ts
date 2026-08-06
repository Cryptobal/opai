import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve accountPlanId desde las cuentas del renglón.
 * Precedencia: override → isPrimary del renglón → categoría legacy (espejo).
 */
export async function resolveAccountPlanIdForFlowRow(
  tenantId: string,
  row: { id?: string; categoryId: string | null },
  overrideAccountPlanId?: string | null,
): Promise<string | null> {
  if (overrideAccountPlanId) return overrideAccountPlanId;

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
