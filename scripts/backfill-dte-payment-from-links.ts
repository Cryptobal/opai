/**
 * Backfill: convierte FinanceBankTransactionLinks históricos (DTE_ISSUED /
 * DTE_RECEIVED) en FinancePaymentRecord + FinancePaymentAllocation, para
 * que la columna `paymentStatus` de los DTE refleje los movimientos
 * bancarios que ya estaban conciliados manualmente.
 *
 * Antes del fix de coherencia (2026-05-12), el flujo manual de "Conciliar
 * movimiento" creaba `FinanceBankTransactionLink` y marcaba la tx
 * `MATCHED`, pero NO creaba `FinancePaymentRecord` ni actualizaba
 * `FinanceDte.paymentStatus`. Resultado: DTEs aparecían como UNPAID en
 * los listados de Facturación aunque su pago estuviera conciliado en banco.
 *
 * Este script:
 *   1. Encuentra todos los movimientos bancarios MATCHED que tienen al
 *      menos un link DTE y NO tienen un FinancePaymentRecord asociado
 *      (`bankTransactionId IS NULL` join). Estos son los "huérfanos".
 *   2. Por cada uno, crea un FinancePaymentRecord con type COLLECTION/
 *      DISBURSEMENT según signo, monto = suma de links DTE, allocations
 *      por DTE.
 *   3. Recomputa `amountPaid`, `amountPending`, `paymentStatus` de cada
 *      DTE afectado a partir del aggregate de allocations.
 *
 * Idempotente: si re-ejecutás, los movimientos que ya tienen un
 * FinancePaymentRecord se saltan; los DTE se recalculan igual (no
 * destructivo).
 *
 * Modos:
 *   DRY_RUN=1 → solo reporta cuántos cambios haría, sin escribir.
 *   TENANT_SLUG=gard → restringe a un tenant.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill-dte-payment-from-links.ts
 *   TENANT_SLUG=gard npx tsx scripts/backfill-dte-payment-from-links.ts
 *   npx tsx scripts/backfill-dte-payment-from-links.ts   # all tenants, write
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

interface TenantStats {
  scannedTxs: number;
  recordsCreated: number;
  allocationsCreated: number;
  dtesRecomputed: number;
  alreadyMigrated: number;
  skippedNoDteLinks: number;
}

async function nextPaymentRecordCode(
  txClient: Prisma.TransactionClient,
  tenantId: string,
  isIncome: boolean,
): Promise<string> {
  const count = await txClient.financePaymentRecord.count({
    where: { tenantId },
  });
  const prefix = isIncome ? "COB" : "PAG";
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

async function recomputeDtePaymentAggregate(
  txClient: Prisma.TransactionClient,
  dteId: string,
): Promise<void> {
  const dte = await txClient.financeDte.findUnique({
    where: { id: dteId },
    select: { totalAmount: true, dueDate: true },
  });
  if (!dte) return;
  const agg = await txClient.financePaymentAllocation.aggregate({
    where: { dteId },
    _sum: { amount: true },
  });
  const total = dte.totalAmount.toNumber();
  const paid = agg._sum.amount ? agg._sum.amount.toNumber() : 0;
  const pending = Math.max(0, total - paid);
  let status: "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE";
  if (paid <= 0) {
    const overdue = dte.dueDate ? dte.dueDate.getTime() < Date.now() : false;
    status = overdue ? "OVERDUE" : "UNPAID";
  } else if (paid + 0.01 >= total) {
    status = "PAID";
  } else {
    status = "PARTIAL";
  }
  await txClient.financeDte.update({
    where: { id: dteId },
    data: {
      amountPaid: new Decimal(paid),
      amountPending: new Decimal(pending),
      paymentStatus: status,
    },
  });
}

async function backfillTenant(
  tenantId: string,
  label: string,
): Promise<TenantStats> {
  const stats: TenantStats = {
    scannedTxs: 0,
    recordsCreated: 0,
    allocationsCreated: 0,
    dtesRecomputed: 0,
    alreadyMigrated: 0,
    skippedNoDteLinks: 0,
  };

  // Movimientos bancarios MATCHED del tenant que no tienen ya un
  // FinancePaymentRecord asociado (esos ya fueron migrados antes o son
  // pagos creados por auto-match desde el inicio).
  const candidateTxs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      reconciliationStatus: "MATCHED",
      paymentRecords: { none: {} },
    },
    select: {
      id: true,
      amount: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });

  stats.scannedTxs = candidateTxs.length;
  if (candidateTxs.length === 0) {
    console.log(`  [${label}] nada que migrar`);
    return stats;
  }

  const dteIdsToRecompute = new Set<string>();

  for (const tx of candidateTxs) {
    const links = await prisma.financeBankTransactionLink.findMany({
      where: {
        tenantId,
        bankTransactionId: tx.id,
        targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
        targetId: { not: null },
      },
      select: { id: true, targetId: true, amount: true, targetType: true },
    });

    if (links.length === 0) {
      stats.skippedNoDteLinks += 1;
      continue;
    }

    const isIncome = tx.amount.toNumber() > 0;
    const totalDteAmount = links.reduce(
      (s, l) => s + l.amount.toNumber(),
      0,
    );

    if (DRY_RUN) {
      console.log(
        `  · DRY tx ${tx.id} ${isIncome ? "+" : "-"}$${Math.abs(
          tx.amount.toNumber(),
        ).toLocaleString("es-CL")} → ${links.length} DTE(s) por $${totalDteAmount.toLocaleString("es-CL")}`,
      );
      stats.recordsCreated += 1;
      stats.allocationsCreated += links.length;
      for (const l of links) {
        if (l.targetId) dteIdsToRecompute.add(l.targetId);
      }
      continue;
    }

    await prisma.$transaction(async (tx2) => {
      const code = await nextPaymentRecordCode(tx2, tenantId, isIncome);
      const record = await tx2.financePaymentRecord.create({
        data: {
          tenantId,
          code,
          type: isIncome ? "COLLECTION" : "DISBURSEMENT",
          date: tx.transactionDate,
          amount: new Decimal(totalDteAmount),
          paymentMethod: "TRANSFER",
          bankAccountId: tx.bankAccountId,
          bankTransactionId: tx.id,
          transferReference: tx.reference ?? null,
          notes: `Backfill desde links históricos · ${tx.description}`.slice(
            0,
            500,
          ),
          status: "CONFIRMED",
          createdBy: "system-backfill",
        },
      });
      await tx2.financePaymentAllocation.createMany({
        data: links.map((l) => ({
          paymentId: record.id,
          dteId: l.targetId!,
          amount: l.amount,
        })),
      });
      stats.recordsCreated += 1;
      stats.allocationsCreated += links.length;
      for (const l of links) {
        if (l.targetId) dteIdsToRecompute.add(l.targetId);
      }
    });
  }

  // Recompute DTE aggregates fuera del loop principal para no saturar la
  // misma transacción con N updates. Cada uno en su propia conexión es
  // aceptable porque el aggregate se calcula desde el estado actual de
  // FinancePaymentAllocation, ya consistente.
  if (!DRY_RUN) {
    for (const dteId of Array.from(dteIdsToRecompute)) {
      await prisma.$transaction(async (tx2) => {
        await recomputeDtePaymentAggregate(tx2, dteId);
      });
      stats.dtesRecomputed += 1;
    }
  } else {
    stats.dtesRecomputed = dteIdsToRecompute.size;
  }

  return stats;
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.error(
      `[!] No se encontro ningun tenant${slug ? ` con slug "${slug}"` : ""}`,
    );
    process.exit(1);
  }

  console.log(
    `${DRY_RUN ? "[DRY-RUN] " : ""}Backfilling DTE payment desde links en ${tenants.length} tenant(s)...\n`,
  );

  let totalRecords = 0;
  let totalAllocations = 0;
  let totalDtes = 0;
  let totalScanned = 0;
  let totalSkipped = 0;
  for (const t of tenants) {
    console.log(`[${t.slug}] (${t.name})`);
    const s = await backfillTenant(t.id, t.slug);
    console.log(
      `  scanned=${s.scannedTxs} records=${s.recordsCreated} allocs=${s.allocationsCreated} dtes=${s.dtesRecomputed} skipped=${s.skippedNoDteLinks}\n`,
    );
    totalRecords += s.recordsCreated;
    totalAllocations += s.allocationsCreated;
    totalDtes += s.dtesRecomputed;
    totalScanned += s.scannedTxs;
    totalSkipped += s.skippedNoDteLinks;
  }
  console.log("---------------------------------------");
  console.log(
    `Total: scanned=${totalScanned} records=${totalRecords} allocations=${totalAllocations} dtes=${totalDtes} skipped=${totalSkipped}`,
  );
  if (DRY_RUN) {
    console.log("(DRY-RUN: no se escribió ningún registro)");
  }
}

main()
  .catch((err) => {
    console.error("[ERROR]", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
