/**
 * Enlaza subfilas canónicas de remuneraciones (Guardias / Equipo interno)
 * a sus padres SUELDO/QUINCENA/PREVIRED, siembra cuentas 5.x vs 6.x y
 * mueve links bancarios históricos del padre al hijo operativo.
 */
import type { FlowRowKey, Prisma } from "@prisma/client";
import { CANONICAL_FLOW_ROWS } from "./canonical-rows";
import {
  PAYROLL_CHILD_ACCOUNT_CODES,
  PAYROLL_CHILD_KEYS,
  PAYROLL_PARENT_KEYS,
} from "./row-keys";

type Tx = Prisma.TransactionClient;

export async function linkPayrollSubrows(tx: Tx, tenantId: string): Promise<void> {
  const rows = await tx.financeFlowRow.findMany({
    where: { tenantId, archivedAt: null, section: "REMUNERACIONES" },
    select: { id: true, canonicalKey: true, parentId: true },
  });
  const byKey = new Map<FlowRowKey, { id: string; parentId: string | null }>();
  for (const r of rows) {
    if (r.canonicalKey && !byKey.has(r.canonicalKey)) {
      byKey.set(r.canonicalKey, { id: r.id, parentId: r.parentId });
    }
  }

  for (const spec of CANONICAL_FLOW_ROWS) {
    if (!spec.parentCanonicalKey || !spec.canonicalKey) continue;
    const child = byKey.get(spec.canonicalKey);
    const parent = byKey.get(spec.parentCanonicalKey);
    if (!child || !parent) continue;
    if (child.parentId === parent.id) continue;
    await tx.financeFlowRow.update({
      where: { id: child.id },
      data: { parentId: parent.id },
    });
    child.parentId = parent.id;
  }

  for (const [key, codes] of Object.entries(PAYROLL_CHILD_ACCOUNT_CODES)) {
    const row = byKey.get(key as FlowRowKey);
    if (!row || codes.length === 0) continue;
    const existing = await tx.financeFlowRowAccount.count({
      where: { tenantId, rowId: row.id },
    });
    if (existing > 0) continue;
    const accounts = await tx.financeAccountPlan.findMany({
      where: { tenantId, code: { in: [...codes] } },
      select: { id: true, code: true },
    });
    const ordered = codes
      .map((code) => accounts.find((a) => a.code === code)?.id)
      .filter((id): id is string => !!id);
    if (ordered.length === 0) continue;
    await tx.financeFlowRowAccount.updateMany({
      where: { tenantId, accountPlanId: { in: ordered }, isDefaultTarget: true },
      data: { isDefaultTarget: false },
    });
    await tx.financeFlowRowAccount.createMany({
      data: ordered.map((accountPlanId, i) => ({
        tenantId,
        rowId: row.id,
        accountPlanId,
        isPrimary: i === 0,
        isDefaultTarget: i === 0,
      })),
    });
  }

  for (const spec of PAYROLL_CHILD_KEYS) {
    const parent = byKey.get(spec.parent);
    const operativo = byKey.get(spec.operativo);
    if (!parent || !operativo) continue;
    await tx.financeBankTransactionLink.updateMany({
      where: { tenantId, flowRowId: parent.id },
      data: { flowRowId: operativo.id },
    });
  }

  // Padres SUELDO/QUINCENA/PREVIRED son cabecera: el plan viejo del padre
  // se sumaba a los hijos y duplicaba el líquido (~80M + ~90M = 170M).
  const parentIds = [...PAYROLL_PARENT_KEYS]
    .map((key) => byKey.get(key)?.id)
    .filter((id): id is string => !!id);
  if (parentIds.length > 0) {
    await tx.financeFlowPlanCell.deleteMany({
      where: { tenantId, rowId: { in: parentIds } },
    });
  }
}
