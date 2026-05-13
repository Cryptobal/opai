/**
 * Regenera retroactivamente los items source=AJUSTE en flujo de caja para
 * conciliaciones masivas SHORTFALL ya hechas antes del deploy de
 * `materializeShortfallInCashflow` (commit 36e1594e4).
 *
 * Identificación de candidatos: bank-tx MATCHED que tiene un
 * FinanceJournalEntry con sourceType=RECONCILIATION + sourceId=bankTx.id
 * (= cabeza de un lote bulk-reconcile que generó asiento de diferencia)
 * y NO tiene aún una FinanceCashflowOccurrence con
 * `bankTransactionId=bankTx.id` y `item.source=AJUSTE`.
 *
 * Como no persistimos el `lote` original, cada candidato se materializa
 * como **1 solo item AJUSTE** (en lugar de N prorrateados entre los movs
 * del lote). El monto total y la cuenta diff se leen del journal entry.
 * Esto es suficiente para que el costo factoring aparezca en flujo de
 * caja con la fecha del depósito.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/regenerate-shortfall-cashflow.ts            # dry-run
 *   DATABASE_URL=... npx tsx scripts/regenerate-shortfall-cashflow.ts --apply    # ejecuta
 *   DATABASE_URL=... npx tsx scripts/regenerate-shortfall-cashflow.ts --apply --tenant=<uuid>
 */
import { PrismaClient } from "@prisma/client";
import { materializeShortfallInCashflow } from "../src/modules/finance/banking/bank-tx-link.service";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const tenantFilter = tenantArg ? tenantArg.split("=")[1] : null;

  console.log(`[regenerate-shortfall] mode=${apply ? "APPLY" : "DRY-RUN"}${tenantFilter ? ` tenant=${tenantFilter}` : ""}`);

  // 1. Levantar candidatos: bank-tx MATCHED con journal entry RECONCILIATION.
  const candidates = await prisma.financeBankTransaction.findMany({
    where: {
      reconciliationStatus: "MATCHED",
      hiddenAt: null,
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
    },
  });

  let scanned = 0;
  let toMaterialize = 0;
  let materialized = 0;
  let skipped = 0;
  let failed = 0;

  for (const tx of candidates) {
    scanned++;

    // ¿Hay asiento RECONCILIATION para este bank-tx? (= shortfall/surplus
    // con `differenceAllocation`). Sin asiento, no había diferencia.
    const entries = await prisma.financeJournalEntry.findMany({
      where: {
        tenantId: tx.tenantId,
        sourceType: "RECONCILIATION",
        sourceId: tx.id,
        status: { in: ["DRAFT", "POSTED"] },
      },
      select: {
        id: true,
        lines: {
          select: {
            accountId: true,
            debit: true,
            credit: true,
            description: true,
          },
        },
      },
    });
    if (entries.length === 0) continue;

    // ¿Ya está materializada en cashflow?
    const existingOcc = await prisma.financeCashflowOccurrence.findFirst({
      where: {
        tenantId: tx.tenantId,
        bankTransactionId: tx.id,
        item: { source: "AJUSTE" },
      },
      select: { id: true },
    });
    if (existingOcc) {
      skipped++;
      continue;
    }

    // Resolver cuenta del banco: necesitamos saber la accountPlanId del
    // FinanceBankAccount para distinguirla de la "cuenta diff" en el asiento.
    const bankAccount = await prisma.financeBankAccount.findFirst({
      where: { id: tx.bankAccountId, tenantId: tx.tenantId },
      select: { accountPlanId: true },
    });
    if (!bankAccount?.accountPlanId) {
      console.warn(`[skip] tx=${tx.id} sin bank account.accountPlanId`);
      failed++;
      continue;
    }

    // Leer las líneas del asiento; identificar la "cuenta diff" (la que NO
    // es la del banco) y el monto.
    const entry = entries[0];
    const diffLines = entry.lines.filter(
      (l) => l.accountId !== bankAccount.accountPlanId,
    );
    if (diffLines.length === 0) {
      console.warn(`[skip] tx=${tx.id} asiento sin líneas no-banco`);
      failed++;
      continue;
    }
    // En shortfall + ingreso: cuenta diff al DEBE (positive debit).
    // En shortfall + egreso: cuenta diff al HABER (positive credit).
    // En surplus la dirección es opuesta — y NO necesitamos regenerar
    // porque surplus ya genera el FinanceBankTransactionLink EXPENSE/INCOME
    // que el projection service lee directo.
    const isIncome = Number(tx.amount) > 0;
    const diffAmount = isIncome
      ? diffLines.reduce((s, l) => s + Number(l.debit), 0)
      : diffLines.reduce((s, l) => s + Number(l.credit), 0);
    if (diffAmount <= 0) {
      // Sin diff de este signo: es surplus (ya cubierto por bank-link).
      continue;
    }
    // Si hay varias líneas diff (prorrateado por centro de costo), usamos
    // la cuenta principal (primera) — el item AJUSTE quedará bajo esa
    // cuenta, lo cual es la categoría que el user eligió.
    const diffAccountId = diffLines[0].accountId;
    const diffLabel = diffLines[0].description ?? "Diferencia conciliación";

    toMaterialize++;
    console.log(
      `[regen] tx=${tx.id} date=${tx.transactionDate.toISOString().slice(0, 10)} amount=${tx.amount} diff=${diffAmount} → diffAccount=${diffAccountId}`,
    );

    if (!apply) continue;

    try {
      await materializeShortfallInCashflow(tx.tenantId, null, {
        txs: [
          {
            id: tx.id,
            bankAccountId: tx.bankAccountId,
            transactionDate: tx.transactionDate,
            description: tx.description,
            reference: tx.reference,
            amount: tx.amount,
          },
        ],
        isIncome,
        diffAmount,
        diffAccountId,
        diffLabel,
      });
      materialized++;
    } catch (err) {
      console.error(
        `[fail] tx=${tx.id}:`,
        err instanceof Error ? err.message : err,
      );
      failed++;
    }
  }

  console.log("───────────────────────────");
  console.log(`Scanned:     ${scanned}`);
  console.log(`To materialize: ${toMaterialize}`);
  if (apply) {
    console.log(`Materialized: ${materialized}`);
    console.log(`Skipped (already): ${skipped}`);
    console.log(`Failed:       ${failed}`);
  } else {
    console.log(`(Dry-run; rerun with --apply para materializar)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
