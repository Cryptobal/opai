/**
 * Repara borradores post-fechados por el bug facturaTiming→issueDate.
 *
 *   npx tsx scripts/repair-future-draft-dates.ts [--dry-run] [--tenant=<id>]
 */
import { repairFutureDraftDates } from "../src/modules/finance/billing/repair-future-draft-dates.service";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
  const tenantId = tenantArg?.slice("--tenant=".length) || undefined;

  const result = await repairFutureDraftDates({ tenantId, dryRun });
  console.log(JSON.stringify({ dryRun, ...result }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
