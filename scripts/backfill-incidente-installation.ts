/**
 * Backfill installationId on OpsRondaIncidente records that lack it.
 *
 * Resolves installationId from:
 *   1. The linked ejecucion's installationId
 *   2. The linked rondaTemplate's installationId
 *
 * Usage:
 *   npx tsx scripts/backfill-incidente-installation.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`🔧 Backfill incidente installationId ${isDryRun ? "(DRY RUN)" : ""}\n`);

  // 1. Find incidents without installationId
  const incidents = await prisma.opsRondaIncidente.findMany({
    where: { installationId: null },
    select: {
      id: true,
      ejecucionId: true,
      rondaTemplateId: true,
      tenantId: true,
    },
  });

  console.log(`Found ${incidents.length} incidents without installationId\n`);

  if (incidents.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // 2. Collect unique ejecucionIds and templateIds
  const ejecucionIds = [...new Set(incidents.map((i) => i.ejecucionId).filter(Boolean))] as string[];
  const templateIds = [...new Set(incidents.map((i) => i.rondaTemplateId).filter(Boolean))] as string[];

  // 3. Fetch related ejecuciones
  const ejecuciones = ejecucionIds.length > 0
    ? await prisma.opsRondaEjecucion.findMany({
        where: { id: { in: ejecucionIds } },
        select: { id: true, installationId: true, rondaTemplateId: true },
      })
    : [];
  const ejMap = new Map(ejecuciones.map((e) => [e.id, e]));

  // 4. Fetch related templates
  const allTemplateIds = [...new Set([
    ...templateIds,
    ...ejecuciones.map((e) => e.rondaTemplateId).filter(Boolean) as string[],
  ])];
  const templates = allTemplateIds.length > 0
    ? await prisma.opsRondaTemplate.findMany({
        where: { id: { in: allTemplateIds } },
        select: { id: true, installationId: true },
      })
    : [];
  const tplMap = new Map(templates.map((t) => [t.id, t]));

  // 5. Resolve and update
  let updated = 0;
  let skipped = 0;

  for (const inc of incidents) {
    let resolvedInstId: string | null = null;

    // Try from ejecucion
    if (inc.ejecucionId) {
      const ej = ejMap.get(inc.ejecucionId);
      if (ej?.installationId) {
        resolvedInstId = ej.installationId;
      } else if (ej?.rondaTemplateId) {
        const tpl = tplMap.get(ej.rondaTemplateId);
        if (tpl?.installationId) resolvedInstId = tpl.installationId;
      }
    }

    // Try from template directly
    if (!resolvedInstId && inc.rondaTemplateId) {
      const tpl = tplMap.get(inc.rondaTemplateId);
      if (tpl?.installationId) resolvedInstId = tpl.installationId;
    }

    if (!resolvedInstId) {
      skipped++;
      continue;
    }

    if (!isDryRun) {
      await prisma.opsRondaIncidente.update({
        where: { id: inc.id },
        data: { installationId: resolvedInstId },
      });
    }
    updated++;
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no installation found): ${skipped}`);
  console.log(`\nDone${isDryRun ? " (dry run — no changes made)" : ""}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
