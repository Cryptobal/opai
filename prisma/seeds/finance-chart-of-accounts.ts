/**
 * Seed: Plan de Cuentas Base Chileno
 * Crea el plan de cuentas estandar para un tenant
 */

import { PrismaClient } from "@prisma/client";
import { CHART_OF_ACCOUNTS_CL } from "../../src/modules/finance/shared/constants/chart-of-accounts-cl";

const prisma = new PrismaClient();

export async function seedChartOfAccounts(tenantId: string) {
  console.log(`Seeding chart of accounts for tenant ${tenantId}...`);

  // Build a map of code -> id for parent resolution
  const codeToId: Record<string, string> = {};

  for (const account of CHART_OF_ACCOUNTS_CL) {
    const parentId = account.parentCode ? codeToId[account.parentCode] ?? null : null;

    const created = await prisma.financeAccountPlan.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: account.code,
        },
      },
      update: {
        name: account.name,
        type: account.type,
        nature: account.nature,
        level: account.level,
        parentId,
        acceptsEntries: account.acceptsEntries,
        isSystem: true,
        isActive: true,
        taxCode: account.taxCode ?? null,
      },
      create: {
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
        nature: account.nature,
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

  console.log(`Seeded ${CHART_OF_ACCOUNTS_CL.length} accounts for tenant ${tenantId}`);
}
