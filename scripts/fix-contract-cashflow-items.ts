/**
 * Repara los datos legacy del bug histórico CLP×UF en cashflow:
 *
 *   (1) FinanceCashflowItem source=CONTRACT con currency="UF"
 *       → quedaron así cuando el sync copiaba `currency` del quote. Se
 *         normaliza a CLP con monthlyCost del quote.
 *
 *   (2) FinanceCashflowOccurrence con `amountClp` absurdamente grande
 *       (≥ 10× el amount del item). Sucede cuando la ocurrencia se
 *       materializó con la fórmula vieja `itemAmount × ufValue` y quedó
 *       congelada en DB; al fixear el item a CLP, esa ocurrencia no se
 *       toca porque el proyector usa amountClp directo. Se borran solo las
 *       `status: "PROJECTED"` (las PAID/CONFIRMED se conservan).
 *
 * Usage:
 *   npx tsx scripts/fix-contract-cashflow-items.ts [--dry-run] [--tenant <id>]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");
const tenantArgIdx = process.argv.indexOf("--tenant");
const filterTenantId =
  tenantArgIdx !== -1 ? process.argv[tenantArgIdx + 1] : null;

const ABSURD_RATIO = 10; // amountClp / item.amount

async function main() {
  console.log(`🔧 Fix contract cashflow items ${isDryRun ? "(DRY RUN)" : ""}\n`);

  // ── (1) Items con currency=UF (legacy) ────────────────────────────
  const brokenItems = await prisma.financeCashflowItem.findMany({
    where: {
      source: "CONTRACT",
      currency: "UF",
      isActive: true,
      ...(filterTenantId ? { tenantId: filterTenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      amount: true,
      currency: true,
      sourceRefId: true,
    },
  });

  console.log(`(1) Items legacy con currency=UF: ${brokenItems.length}`);
  let fixedItems = 0;
  for (const item of brokenItems) {
    if (!item.sourceRefId) continue;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: item.sourceRefId, tenantId: item.tenantId },
      select: { id: true, code: true, monthlyCost: true },
    });
    if (!quote) continue;
    const newAmount = Number(quote.monthlyCost);
    console.log(
      `  · ${item.name}  ${item.amount} ${item.currency} → ${newAmount} CLP (quote ${quote.code})`,
    );
    if (isDryRun) {
      fixedItems++;
      continue;
    }
    await prisma.financeCashflowItem.update({
      where: { id: item.id },
      data: { amount: newAmount, currency: "CLP" },
    });
    fixedItems++;
  }
  console.log(`    ${isDryRun ? "(dry run) " : ""}items reparados: ${fixedItems}\n`);

  // ── (2) Occurrences PROJECTED con amountClp absurdo ───────────────
  // Trabajamos por item para evaluar ratio (amountClp / item.amount).
  const allContractItems = await prisma.financeCashflowItem.findMany({
    where: {
      source: "CONTRACT",
      ...(filterTenantId ? { tenantId: filterTenantId } : {}),
    },
    select: { id: true, tenantId: true, name: true, amount: true },
  });

  let absurdOccs = 0;
  let deletedOccs = 0;
  for (const item of allContractItems) {
    const baseAmount = Number(item.amount);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) continue;
    const threshold = baseAmount * ABSURD_RATIO;
    const occs = await prisma.financeCashflowOccurrence.findMany({
      where: {
        tenantId: item.tenantId,
        itemId: item.id,
        status: "PROJECTED",
        amountClp: { gt: threshold },
      },
      select: { id: true, scheduledDate: true, amountClp: true },
    });
    if (occs.length === 0) continue;
    console.log(
      `(2) "${item.name}" item.amount=${baseAmount} threshold=${threshold} → ${occs.length} ocurrencia(s) absurda(s)`,
    );
    for (const o of occs) {
      console.log(
        `      · ${o.scheduledDate.toISOString().slice(0, 10)} amountClp=${o.amountClp}`,
      );
      absurdOccs++;
    }
    if (!isDryRun) {
      const r = await prisma.financeCashflowOccurrence.deleteMany({
        where: {
          tenantId: item.tenantId,
          itemId: item.id,
          status: "PROJECTED",
          amountClp: { gt: threshold },
        },
      });
      deletedOccs += r.count;
    }
  }
  console.log(
    `    Total ocurrencias absurdas: ${absurdOccs}  ·  borradas: ${deletedOccs} ${isDryRun ? "(dry run)" : ""}\n`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
