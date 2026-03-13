/**
 * One-time script: Archive all unresolved historical alerts.
 *
 * Run with:
 *   npx tsx scripts/migrate-alertas-historicas.ts
 *
 * This archives all unresolved alerts older than today (Chile time)
 * so the monitoring dashboard starts clean.
 */

import { PrismaClient } from "@prisma/client";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const prisma = new PrismaClient();
const CHILE_TZ = "America/Santiago";

async function main() {
  const now = new Date();
  // Start of today in Chile timezone
  const local = toZonedTime(now, CHILE_TZ);
  local.setHours(0, 0, 0, 0);
  const startOfToday = fromZonedTime(local, CHILE_TZ);

  console.log(`Archiving unresolved alerts created before ${startOfToday.toISOString()} (start of today Chile time)...`);

  const result = await prisma.opsAlertaRonda.updateMany({
    where: {
      resuelta: false,
      archivedAt: null,
      createdAt: { lt: startOfToday },
    },
    data: {
      archivedAt: now,
    },
  });

  console.log(`Done. ${result.count} alerts archived.`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
