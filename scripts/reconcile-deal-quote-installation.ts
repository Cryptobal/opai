/**
 * Script de reconciliación one-shot para datos históricos.
 *
 * Para todos los deals 'won' del tenant:
 *   1. Identifica la quote ganadora.
 *   2. Marca la ganadora como 'approved' si está en 'sent'.
 *   3. Marca hermanas en 'draft'/'sent' como 'rejected'.
 *   4. Si la instalación está en 'prospect'/'inactive' → activa + setea
 *      activatedByDealId. Si está active sin activatedByDealId → solo setea.
 *
 * Para deals 'lost':
 *   1. Marca quotes en 'draft'/'sent' como 'rejected'.
 *
 * Genera reporte JSON con cambios aplicados e inconsistencias no resolubles.
 *
 * Uso:
 *   npx tsx scripts/reconcile-deal-quote-installation.ts <tenantId> [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import {
  propagateDealWon,
  propagateDealLost,
  type DealWonPropagationResult,
  type DealLostPropagationResult,
} from "../src/lib/crm/deal-propagation";

const prisma = new PrismaClient();

interface ReconcileReport {
  tenantId: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  dealsProcessed: number;
  dealsWon: Array<
    DealWonPropagationResult & { dealId: string; title: string }
  >;
  dealsLost: Array<
    DealLostPropagationResult & { dealId: string; title: string }
  >;
  unresolved: Array<{ dealId: string; reason: string }>;
}

async function main() {
  const tenantId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantId) {
    console.error(
      "Usage: npx tsx scripts/reconcile-deal-quote-installation.ts <tenantId> [--dry-run]"
    );
    process.exit(1);
  }

  const report: ReconcileReport = {
    tenantId,
    dryRun,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    dealsProcessed: 0,
    dealsWon: [],
    dealsLost: [],
    unresolved: [],
  };

  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, status: { in: ["won", "lost"] } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `[reconcile] Procesando ${deals.length} deals para tenant ${tenantId} (dryRun=${dryRun})`
  );

  for (const deal of deals) {
    report.dealsProcessed++;
    try {
      if (dryRun) {
        console.log(
          `[reconcile] (dry) ${deal.status} deal ${deal.id} ${deal.title}`
        );
        continue;
      }

      if (deal.status === "won") {
        const result = await prisma.$transaction((tx) =>
          propagateDealWon(tx, tenantId, deal.id)
        );
        report.dealsWon.push({ ...result, dealId: deal.id, title: deal.title });
        console.log(
          `[reconcile] OK won ${deal.id} → quote=${result.winningQuoteId} install=${result.activatedInstallationId}`
        );
      } else if (deal.status === "lost") {
        const result = await prisma.$transaction((tx) =>
          propagateDealLost(tx, tenantId, deal.id)
        );
        report.dealsLost.push({ ...result, dealId: deal.id, title: deal.title });
        console.log(
          `[reconcile] OK lost ${deal.id} → rejected=${result.rejectedQuoteIds.length} candidate=${result.deactivationCandidate?.installationId ?? "none"}`
        );
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      report.unresolved.push({ dealId: deal.id, reason });
      console.error(`[reconcile] FAIL ${deal.id}: ${reason}`);
    }
  }

  report.finishedAt = new Date().toISOString();

  const reportPath = `/tmp/reconcile-report-${tenantId}-${Date.now()}.json`;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n[reconcile] Done. Report: ${reportPath}`);
  console.log(`  Won: ${report.dealsWon.length}`);
  console.log(`  Lost: ${report.dealsLost.length}`);
  console.log(`  Unresolved: ${report.unresolved.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
