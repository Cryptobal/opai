/**
 * Seed ALL modules for Gard tenant.
 * Run: npx tsx scripts/seed-gard-modules.ts
 */
import { prisma } from '@/lib/prisma';
import { ALL_MODULES } from '@/lib/tenant-modules';

async function seedGardModules() {
  const gard = await prisma.tenant.findFirst({
    where: { slug: 'gard' },
  });

  if (!gard) {
    console.error('Tenant Gard not found');
    process.exit(1);
  }

  console.log(`Seeding modules for Gard (${gard.id})...`);

  let created = 0;
  for (const mod of ALL_MODULES) {
    await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId: gard.id, module: mod } },
      update: { enabled: true },
      create: { tenantId: gard.id, module: mod as string, enabled: true },
    });
    created++;
  }

  console.log(`Done: ${created} modules enabled for Gard`);
}

seedGardModules()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
