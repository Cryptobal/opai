/**
 * Prisma Client Singleton
 * 
 * Evita crear múltiples instancias de Prisma Client en desarrollo
 * (Next.js hot-reload puede crear muchas instancias)
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Zero-downtime compatibility:
// if code deploys before DB migration, create the nullable column on demand.
let ensureActiveQuotationColumnPromise: Promise<void> | null = null;

async function ensureActiveQuotationColumn(): Promise<void> {
  if (!ensureActiveQuotationColumnPromise) {
    ensureActiveQuotationColumnPromise = basePrisma
      .$executeRawUnsafe(
        'ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS active_quotation_id uuid'
      )
      .then(() => undefined)
      .catch((error) => {
        // Allow startup to continue; if the column is truly unavailable,
        // Prisma queries on CrmDeal will raise explicit errors afterwards.
        console.error('Could not ensure crm.deals.active_quotation_id column:', error);
      });
  }
  await ensureActiveQuotationColumnPromise;
}

const prismaWithCompatibility = basePrisma.$extends({
  query: {
    crmDeal: {
      async $allOperations({ args, query }) {
        await ensureActiveQuotationColumn();
        return query(args);
      },
    },
  },
});

export const prisma = prismaWithCompatibility as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export default prisma;
