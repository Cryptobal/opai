import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve accountPlanId desde la categoría de una fila de flujo.
 * Precedencia: mapeo primario (lo que ve el usuario) → escalar legacy.
 */
export async function resolveAccountPlanIdForFlowRow(
  tenantId: string,
  row: { categoryId: string | null },
  overrideAccountPlanId?: string | null,
): Promise<string | null> {
  if (overrideAccountPlanId) return overrideAccountPlanId;
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
