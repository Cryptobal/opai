/**
 * Account Plan Service
 * CRUD for chart of accounts with hierarchical tree support
 */

import { prisma } from "@/lib/prisma";
import { CHART_OF_ACCOUNTS_CL } from "../shared/constants/chart-of-accounts-cl";
import type { AccountTreeNode } from "../shared/types/accounting.types";

/**
 * Get full chart of accounts as a flat list
 */
export async function getAccountPlan(tenantId: string) {
  return prisma.financeAccountPlan.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });
}

/**
 * Get chart of accounts as hierarchical tree
 */
export async function getAccountTree(tenantId: string): Promise<AccountTreeNode[]> {
  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  });

  const map = new Map<string, AccountTreeNode>();
  const roots: AccountTreeNode[] = [];

  for (const acc of accounts) {
    map.set(acc.id, {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      nature: acc.nature,
      level: acc.level,
      isSystem: acc.isSystem,
      isActive: acc.isActive,
      acceptsEntries: acc.acceptsEntries,
      children: [],
    });
  }

  for (const acc of accounts) {
    const node = map.get(acc.id)!;
    if (acc.parentId && map.has(acc.parentId)) {
      map.get(acc.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Prefijo de código por tipo de cuenta (convención plan chileno). */
const TYPE_CODE_PREFIX: Record<string, string> = {
  ASSET: "1",
  LIABILITY: "2",
  EQUITY: "3",
  REVENUE: "4",
  COST: "5",
  EXPENSE: "6",
};

/**
 * Sugiere el siguiente código disponible dentro de un padre (o raíz por tipo).
 *
 * - Con parentId: lee los hijos directos del padre, parsea el último segmento
 *   numérico de cada code, y propone `${parent.code}.${maxLastSeg + 1}`
 *   con padding según el formato observado (mínimo 2 dígitos en hojas).
 * - Sin parentId: busca el siguiente correlativo a nivel raíz dentro del
 *   prefijo del tipo (1=Asset, 2=Liab, 3=Equity, 4=Rev, 5=Cost, 6=Exp).
 */
export async function suggestNextAccountCode(
  tenantId: string,
  type: string,
  parentId: string | null,
): Promise<{ code: string; level: number; parentCode: string | null }> {
  if (parentId) {
    const parent = await prisma.financeAccountPlan.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, code: true, level: true },
    });
    if (!parent) throw new Error("Cuenta padre no encontrada");

    const children = await prisma.financeAccountPlan.findMany({
      where: { tenantId, parentId },
      select: { code: true },
    });

    const lastSegs = children
      .map((c) => {
        const segs = c.code.split(".");
        return parseInt(segs[segs.length - 1] ?? "", 10);
      })
      .filter((n) => Number.isFinite(n));
    const next = (lastSegs.length ? Math.max(...lastSegs) : 0) + 1;

    const padLen = children.reduce((acc, c) => {
      const last = c.code.split(".").pop() ?? "";
      return /^\d+$/.test(last) ? Math.max(acc, last.length) : acc;
    }, 2);
    const padded = String(next).padStart(padLen, "0");
    return {
      code: `${parent.code}.${padded}`,
      level: parent.level + 1,
      parentCode: parent.code,
    };
  }

  const prefix = TYPE_CODE_PREFIX[type];
  if (!prefix) throw new Error(`Tipo de cuenta inválido: ${type}`);

  const roots = await prisma.financeAccountPlan.findMany({
    where: { tenantId, parentId: null, type: type as never },
    select: { code: true },
  });
  const usedSecondSegs = roots
    .map((r) => {
      const segs = r.code.split(".");
      if (segs[0] !== prefix) return NaN;
      return parseInt(segs[1] ?? "", 10);
    })
    .filter((n) => Number.isFinite(n));
  const next = (usedSecondSegs.length ? Math.max(...usedSecondSegs) : 0) + 1;
  return { code: `${prefix}.${next}`, level: 2, parentCode: null };
}

/**
 * Create a new account
 */
export async function createAccount(
  tenantId: string,
  data: {
    code: string;
    name: string;
    type: string;
    nature: string;
    parentId?: string;
    level: number;
    acceptsEntries: boolean;
    description?: string;
    taxCode?: string;
  }
) {
  return prisma.financeAccountPlan.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      type: data.type as any,
      nature: data.nature as any,
      parentId: data.parentId ?? null,
      level: data.level,
      acceptsEntries: data.acceptsEntries,
      description: data.description ?? null,
      taxCode: data.taxCode ?? null,
      isSystem: false,
      isActive: true,
    },
  });
}

/**
 * Update an account (system accounts: only name and description editable)
 */
export async function updateAccount(
  tenantId: string,
  accountId: string,
  data: Partial<{
    name: string;
    description: string;
    isActive: boolean;
    acceptsEntries: boolean;
  }>
) {
  const account = await prisma.financeAccountPlan.findFirst({
    where: { id: accountId, tenantId },
  });
  if (!account) throw new Error("Cuenta no encontrada");

  // System accounts: only allow name and description changes
  if (account.isSystem) {
    return prisma.financeAccountPlan.update({
      where: { id: accountId },
      data: {
        name: data.name ?? account.name,
        description: data.description ?? account.description,
      },
    });
  }

  return prisma.financeAccountPlan.update({
    where: { id: accountId },
    data: {
      name: data.name ?? account.name,
      description: data.description ?? account.description,
      isActive: data.isActive ?? account.isActive,
      acceptsEntries: data.acceptsEntries ?? account.acceptsEntries,
    },
  });
}

/**
 * Seed the standard Chilean chart of accounts for a tenant
 */
export async function seedAccountPlan(tenantId: string) {
  const existing = await prisma.financeAccountPlan.count({
    where: { tenantId, isSystem: true },
  });

  if (existing > 0) {
    throw new Error("El plan de cuentas base ya fue creado para esta empresa");
  }

  const codeToId: Record<string, string> = {};

  for (const account of CHART_OF_ACCOUNTS_CL) {
    const parentId = account.parentCode ? codeToId[account.parentCode] ?? null : null;

    const created = await prisma.financeAccountPlan.create({
      data: {
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type as any,
        nature: account.nature as any,
        level: account.level,
        parentId,
        acceptsEntries: account.acceptsEntries,
        isSystem: true,
        isActive: true,
        taxCode: account.taxCode ?? null,
      },
    });

    codeToId[account.code] = created.id;
  }

  return { count: CHART_OF_ACCOUNTS_CL.length };
}
