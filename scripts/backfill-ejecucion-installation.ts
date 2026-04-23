/**
 * Backfill installationId on OpsRondaEjecucion records that lack it.
 *
 * Context:
 *   - The cron (`/api/cron/rondas/generar`) and several regeneration paths
 *     create scheduled executions without `installationId` — the installation
 *     is only reachable through `rondaTemplate.installationId`.
 *   - The portal-cliente endpoints filter strictly by `installationId`, so
 *     those rounds never reach the customer portal.
 *
 * This script resolves and persists `installationId` using
 * `rondaTemplate.installationId` for every execution where it's currently null.
 *
 * Usage:
 *   npx tsx scripts/backfill-ejecucion-installation.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `🔧 Backfill ejecucion.installationId ${isDryRun ? "(DRY RUN)" : ""}\n`,
  );

  // 1) Count how many rows need backfill (fast).
  const pendingCount = await prisma.opsRondaEjecucion.count({
    where: { installationId: null, rondaTemplateId: { not: null } },
  });

  if (pendingCount === 0) {
    console.log("Nothing to backfill — no executions with null installationId.");
    return;
  }

  console.log(`Executions missing installationId: ${pendingCount}`);

  if (isDryRun) {
    // Build a preview: tenantId → { templateName → count }
    const preview = await prisma.opsRondaEjecucion.findMany({
      where: { installationId: null, rondaTemplateId: { not: null } },
      select: {
        tenantId: true,
        rondaTemplate: {
          select: { name: true, installationId: true },
        },
      },
      take: 200,
    });

    const byTenantTpl = new Map<string, number>();
    let resolvable = 0;
    let unresolvable = 0;
    for (const row of preview) {
      if (row.rondaTemplate?.installationId) resolvable++;
      else unresolvable++;
      const key = `${row.tenantId} | ${row.rondaTemplate?.name ?? "(sin template)"}`;
      byTenantTpl.set(key, (byTenantTpl.get(key) ?? 0) + 1);
    }

    console.log("\nSample (first 200 rows):");
    console.log(`  Resolvable via rondaTemplate: ${resolvable}`);
    console.log(`  Unresolvable (template sin installationId): ${unresolvable}`);
    console.log("\nBreakdown (tenant | template):");
    for (const [k, v] of [...byTenantTpl.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v.toString().padStart(5, " ")}  ${k}`);
    }
    console.log("\nDone (dry run — no changes made).");
    return;
  }

  // 2) Run a single set-based UPDATE — fast and transactional.
  //    `rt.installation_id` can still be null for a few legacy templates; those
  //    rows will simply remain untouched (still unresolvable).
  const sql = `
    UPDATE ops.ronda_ejecuciones AS e
       SET installation_id = rt.installation_id
      FROM ops.ronda_templates AS rt
     WHERE e.ronda_template_id = rt.id
       AND e.installation_id IS NULL
       AND rt.installation_id IS NOT NULL;
  `;

  const updated = await prisma.$executeRawUnsafe(sql);
  console.log(`Updated rows: ${updated}`);

  // 3) Report leftovers that couldn't be resolved.
  const stillNull = await prisma.opsRondaEjecucion.count({
    where: { installationId: null },
  });
  const adhocStillNull = await prisma.opsRondaEjecucion.count({
    where: { installationId: null, isAdHoc: true },
  });
  console.log(
    `Remaining with null installationId: ${stillNull} (of which ${adhocStillNull} ad-hoc)`,
  );

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
