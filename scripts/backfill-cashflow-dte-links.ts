/**
 * Backfill: vincula DTEs existentes (siiStatus en DRAFT/PENDING/SENT/ACCEPTED)
 * a sus occurrences proyectadas en el flujo de caja, ejecutando el mismo
 * algoritmo del matcher pero contra el histórico. NO se ejecuta automáticamente.
 *
 * Uso:
 *   npx tsx scripts/backfill-cashflow-dte-links.ts --tenant=<tenantId> --dry-run
 *   npx tsx scripts/backfill-cashflow-dte-links.ts --tenant=<tenantId>
 *
 * Si se omite --tenant, recorre todos los tenants activos.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATE_TOLERANCE_DAYS = 15;

interface CliArgs {
  tenantId: string | null;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { tenantId: null, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--tenant=")) args.tenantId = arg.split("=")[1] ?? null;
  }
  return args;
}

async function findMatchOccurrence(
  tenantId: string,
  dte: {
    id: string;
    crmAccountId: string | null;
    installationId: string | null;
    date: Date;
    totalAmount: { toNumber(): number } | number;
  },
): Promise<string | null> {
  if (!dte.crmAccountId && !dte.installationId) return null;

  const dateFrom = new Date(dte.date);
  dateFrom.setDate(dateFrom.getDate() - DATE_TOLERANCE_DAYS);
  const dateTo = new Date(dte.date);
  dateTo.setDate(dateTo.getDate() + DATE_TOLERANCE_DAYS);

  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      isActive: true,
      source: "CONTRACT",
      OR: [
        dte.installationId ? { installationId: dte.installationId } : null,
        dte.crmAccountId ? { crmAccountId: dte.crmAccountId } : null,
      ].filter(Boolean) as object[],
    },
    select: { id: true },
  });
  if (items.length === 0) return null;

  const candidates = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      itemId: { in: items.map((i) => i.id) },
      scheduledDate: { gte: dateFrom, lte: dateTo },
      status: "PROJECTED",
      dteId: null,
    },
    select: { id: true, scheduledDate: true, amountClp: true },
  });
  if (candidates.length === 0) return null;

  const amountClp =
    typeof dte.totalAmount === "number"
      ? dte.totalAmount
      : dte.totalAmount.toNumber();

  candidates.sort((a, b) => {
    const dA = Math.abs(a.scheduledDate.getTime() - dte.date.getTime());
    const dB = Math.abs(b.scheduledDate.getTime() - dte.date.getTime());
    if (dA !== dB) return dA - dB;
    const amtA = Math.abs(Number(a.amountClp) - amountClp);
    const amtB = Math.abs(Number(b.amountClp) - amountClp);
    return amtA - amtB;
  });
  return candidates[0].id;
}

async function backfillTenant(
  tenantId: string,
  label: string,
  dryRun: boolean,
): Promise<{ checked: number; linked: number }> {
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: { in: ["DRAFT", "PENDING", "SENT", "ACCEPTED"] },
      cashflowOccurrences: { none: {} },
    },
    select: {
      id: true,
      folio: true,
      date: true,
      siiStatus: true,
      crmAccountId: true,
      installationId: true,
      totalAmount: true,
    },
    orderBy: { date: "asc" },
  });

  if (dtes.length === 0) {
    console.log(`  [${label}] nada que vincular`);
    return { checked: 0, linked: 0 };
  }

  let linked = 0;
  for (const d of dtes) {
    const matchId = await findMatchOccurrence(tenantId, d);
    if (!matchId) continue;
    if (dryRun) {
      console.log(
        `  · [DRY] DTE ${d.id} (F#${d.folio}, ${d.siiStatus}) → occ ${matchId}`,
      );
    } else {
      await prisma.financeCashflowOccurrence.update({
        where: { id: matchId },
        data: { dteId: d.id },
      });
      console.log(
        `  · DTE ${d.id} (F#${d.folio}, ${d.siiStatus}) → occ ${matchId}`,
      );
    }
    linked++;
  }
  return { checked: dtes.length, linked };
}

async function main() {
  const args = parseArgs();
  const tenants = args.tenantId
    ? await prisma.tenant.findMany({
        where: { id: args.tenantId, active: true },
        select: { id: true, slug: true, name: true },
      })
    : await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

  if (tenants.length === 0) {
    console.error("❌ No se encontró ningún tenant activo con el filtro dado.");
    process.exit(1);
  }

  console.log(
    `🔗 Backfill cashflow ↔ DTE — ${tenants.length} tenant(s)${args.dryRun ? " [DRY-RUN]" : ""}\n`,
  );

  let totalChecked = 0;
  let totalLinked = 0;
  for (const t of tenants) {
    const label = `${t.slug ?? t.name}`;
    console.log(`▸ ${label}`);
    const { checked, linked } = await backfillTenant(t.id, label, args.dryRun);
    totalChecked += checked;
    totalLinked += linked;
    console.log(`  ✓ ${linked}/${checked} DTEs vinculados`);
  }

  console.log(
    `\n✔ Resumen: ${totalLinked}/${totalChecked} DTEs vinculados${
      args.dryRun ? " (dry-run, sin escrituras)" : ""
    }`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
