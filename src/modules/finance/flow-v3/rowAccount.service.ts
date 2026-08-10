import "server-only";
import { prisma } from "@/lib/prisma";
import { setMappingsForCategory } from "@/modules/finance/cashflow/categoryAccount.service";
import { FLOW_SECTION_ORDER } from "./row-sort";

export interface RowAccountRef {
  id: string;
  accountPlanId: string;
  isPrimary: boolean;
  isDefaultTarget: boolean;
  createdAt: Date;
  accountPlan: { code: string; name: string; type: string };
}

export async function listAccountsForRow(
  tenantId: string,
  rowId: string,
): Promise<RowAccountRef[]> {
  const rows = await prisma.financeFlowRowAccount.findMany({
    where: { tenantId, rowId },
    include: {
      accountPlan: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    accountPlanId: r.accountPlanId,
    isPrimary: r.isPrimary,
    isDefaultTarget: r.isDefaultTarget,
    createdAt: r.createdAt,
    accountPlan: r.accountPlan,
  }));
}

export interface SetAccountsOpts {
  /** accountPlanId que debe quedar como destino por defecto (opcional). */
  defaultTargetAccountPlanId?: string | null;
  /** Si true, no espeja hacia FinanceCashflowCategoryAccount. */
  skipLegacyMirror?: boolean;
}

/**
 * Reemplaza las cuentas del renglón. El primer id queda `isPrimary`.
 * Transaccional. Espeja a la categoría vinculada si existe categoryId.
 */
export async function setAccountsForRow(
  tenantId: string,
  rowId: string,
  accountPlanIds: string[],
  opts: SetAccountsOpts = {},
): Promise<void> {
  const uniqueIds = [...new Set(accountPlanIds.filter(Boolean))];
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true, categoryId: true },
  });
  if (!row) throw new Error("Renglón no encontrado");

  if (uniqueIds.length > 0) {
    const plans = await prisma.financeAccountPlan.findMany({
      where: { tenantId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (plans.length !== uniqueIds.length) {
      throw new Error("Una o más cuentas contables no existen en el tenant");
    }
  }

  const defaultTarget =
    opts.defaultTargetAccountPlanId &&
    uniqueIds.includes(opts.defaultTargetAccountPlanId)
      ? opts.defaultTargetAccountPlanId
      : null;

  await prisma.$transaction(async (tx) => {
    // Liberar destinos por defecto de otras filas para las cuentas que vamos
    // a marcar como default en este renglón (unique parcial).
    if (defaultTarget) {
      await tx.financeFlowRowAccount.updateMany({
        where: {
          tenantId,
          accountPlanId: defaultTarget,
          isDefaultTarget: true,
          NOT: { rowId },
        },
        data: { isDefaultTarget: false },
      });
    }

    await tx.financeFlowRowAccount.deleteMany({ where: { tenantId, rowId } });

    for (let i = 0; i < uniqueIds.length; i++) {
      const accountPlanId = uniqueIds[i];
      await tx.financeFlowRowAccount.create({
        data: {
          tenantId,
          rowId,
          accountPlanId,
          isPrimary: i === 0,
          isDefaultTarget: defaultTarget === accountPlanId,
        },
      });
    }
  });

  if (!opts.skipLegacyMirror && row.categoryId) {
    await setMappingsForCategory(tenantId, row.categoryId, uniqueIds);
  }
}

/**
 * Marca un renglón como destino por defecto de una cuenta.
 * Desmarca cualquier otro renglón del mismo tenant+cuenta.
 */
export async function setDefaultTarget(
  tenantId: string,
  rowId: string,
  accountPlanId: string,
): Promise<void> {
  const mapping = await prisma.financeFlowRowAccount.findFirst({
    where: { tenantId, rowId, accountPlanId },
    select: { id: true },
  });
  if (!mapping) {
    throw new Error("La cuenta no está asociada a este renglón");
  }

  await prisma.$transaction(async (tx) => {
    await tx.financeFlowRowAccount.updateMany({
      where: {
        tenantId,
        accountPlanId,
        isDefaultTarget: true,
        NOT: { rowId },
      },
      data: { isDefaultTarget: false },
    });
    await tx.financeFlowRowAccount.updateMany({
      where: { tenantId, rowId, accountPlanId },
      data: { isDefaultTarget: true },
    });
  });
}

const SECTION_RANK = new Map(
  FLOW_SECTION_ORDER.map((s, i) => [s, i] as const),
);

/**
 * Mapa accountPlanId → rowId aplicando precedencia:
 * isDefaultTarget → menor orden de sección → menor orderIndex.
 */
export async function bulkAccountToRow(
  tenantId: string,
  accountPlanIds?: string[],
): Promise<Map<string, string>> {
  const where: {
    tenantId: string;
    accountPlanId?: { in: string[] };
    row: { archivedAt: null };
  } = {
    tenantId,
    row: { archivedAt: null },
  };
  if (accountPlanIds && accountPlanIds.length > 0) {
    where.accountPlanId = { in: accountPlanIds };
  }

  const mappings = await prisma.financeFlowRowAccount.findMany({
    where,
    select: {
      accountPlanId: true,
      rowId: true,
      isDefaultTarget: true,
      row: { select: { section: true, orderIndex: true } },
    },
  });

  type Cand = {
    rowId: string;
    isDefaultTarget: boolean;
    sectionRank: number;
    orderIndex: number;
  };
  const byAccount = new Map<string, Cand[]>();
  for (const m of mappings) {
    const list = byAccount.get(m.accountPlanId) ?? [];
    list.push({
      rowId: m.rowId,
      isDefaultTarget: m.isDefaultTarget,
      sectionRank: SECTION_RANK.get(m.row.section) ?? 99,
      orderIndex: m.row.orderIndex,
    });
    byAccount.set(m.accountPlanId, list);
  }

  const result = new Map<string, string>();
  for (const [accountPlanId, cands] of byAccount) {
    cands.sort((a, b) => {
      if (a.isDefaultTarget !== b.isDefaultTarget) {
        return a.isDefaultTarget ? -1 : 1;
      }
      if (a.sectionRank !== b.sectionRank) return a.sectionRank - b.sectionRank;
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.rowId.localeCompare(b.rowId);
    });
    result.set(accountPlanId, cands[0].rowId);
  }
  return result;
}

export interface AccountRowCandidate {
  rowId: string;
  canonicalKey: string | null;
  isDefaultTarget: boolean;
}

/**
 * Mapa accountPlanId → todos los renglones que la tienen (sin colapsar).
 * Usado por deriveReal para polaridad aporte(+)/devolución(−) cuando
 * Acreedores Varios está en ambos renglones de socios.
 */
export async function bulkAccountToRowCandidates(
  tenantId: string,
  accountPlanIds?: string[],
): Promise<Map<string, AccountRowCandidate[]>> {
  const where: {
    tenantId: string;
    accountPlanId?: { in: string[] };
    row: { archivedAt: null };
  } = {
    tenantId,
    row: { archivedAt: null },
  };
  if (accountPlanIds && accountPlanIds.length > 0) {
    where.accountPlanId = { in: accountPlanIds };
  }

  const mappings = await prisma.financeFlowRowAccount.findMany({
    where,
    select: {
      accountPlanId: true,
      rowId: true,
      isDefaultTarget: true,
      row: { select: { canonicalKey: true } },
    },
  });

  const result = new Map<string, AccountRowCandidate[]>();
  for (const m of mappings) {
    const list = result.get(m.accountPlanId) ?? [];
    list.push({
      rowId: m.rowId,
      canonicalKey: m.row.canonicalKey,
      isDefaultTarget: m.isDefaultTarget,
    });
    result.set(m.accountPlanId, list);
  }
  return result;
}
