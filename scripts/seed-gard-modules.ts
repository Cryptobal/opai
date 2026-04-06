/**
 * Seed Gard Tenant Modules
 *
 * Inserta todos los módulos habilitados para el tenant Gard,
 * de modo que Gard también quede bajo el sistema de TenantModule
 * en vez de depender del fallback "sin registros = todo habilitado".
 *
 * Uso:
 *   npx tsx scripts/seed-gard-modules.ts
 */

import { PrismaClient } from '@prisma/client';
import { ALL_MODULES } from '../src/lib/tenant-modules';

const prisma = new PrismaClient();

async function main() {
  const gard = await prisma.tenant.findUnique({ where: { slug: 'gard' } });
  if (!gard) {
    console.log('Tenant "gard" not found. Nothing to do.');
    return;
  }

  console.log(`Found tenant "gard" (${gard.id}). Seeding ${ALL_MODULES.length} modules...`);

  let created = 0;
  let updated = 0;

  for (const mod of ALL_MODULES) {
    const result = await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId: gard.id, module: mod } },
      update: { enabled: true },
      create: { tenantId: gard.id, module: mod as string, enabled: true },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`Done. Created: ${created}, Updated: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
