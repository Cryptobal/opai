/**
 * Detecta DTEs en estado PARTIAL cuyas allocations vienen de PaymentRecords
 * "Conciliación masiva N→N" (= bulk reconcile pre-shortfall), agrupa los
 * lotes por bank-tx involucrados, y promueve cada lote a SHORTFALL:
 *   - Crea PaymentAllocation adicional por DTE para llegar al amountPending.
 *   - Recompute DTE → PAID.
 *   - Genera FinanceJournalEntry DEBE Costo Factoring (o cuenta elegida) /
 *     HABER Banco con el monto de la diferencia.
 *   - Materializa N items AJUSTE en cashflow (uno por bank-tx del lote).
 *
 * Estrategia para identificar lotes: dos DTEs pertenecen al mismo lote si
 * sus PaymentRecords (con notes "Conciliación masiva N→N") comparten al
 * menos un bank-tx. Construimos componentes conexos sobre el grafo
 * DTE ↔ bank-tx.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx --env-file=.env.local \
 *     scripts/upgrade-partial-to-shortfall.ts                 # dry-run
 *   DATABASE_URL=... npx tsx --env-file=.env.local \
 *     scripts/upgrade-partial-to-shortfall.ts --apply         # ejecuta
 *   DATABASE_URL=... npx tsx --env-file=.env.local \
 *     scripts/upgrade-partial-to-shortfall.ts --apply \
 *     --diff-account=<accountPlanId>                           # cuenta diff explícita
 *
 * Default cuenta diff: si no se pasa --diff-account, busca una cuenta
 * llamada "Costo Factoring" (case-insensitive). Si no existe, falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { createManualEntry } from "../src/modules/finance/accounting/journal-entry.service";
import { materializeShortfallInCashflow } from "../src/modules/finance/banking/bank-tx-link.service";

const prisma = new PrismaClient();

interface LoteCandidate {
  tenantId: string;
  dteIds: string[];
  bankTxIds: string[];
  totalBank: number;
  totalDteAmount: number;
  shortfall: number;
}

async function findLotes(): Promise<LoteCandidate[]> {
  // Tomamos TODAS las allocations de PaymentRecord con notes
  // "Conciliación masiva N→N" (= bulk reconcile). Después agrupamos por
  // lote (componentes conexos DTE ↔ bank-tx) y verificamos si hay
  // descalce entre sum(allocations) y sum(banco) — eso indica un costo
  // factoring no registrado.
  const allocs = await prisma.financePaymentAllocation.findMany({
    where: {
      payment: { notes: { contains: "Conciliación masiva N→N" } },
    },
    select: {
      dteId: true,
      amount: true,
      payment: {
        select: {
          bankTransactionId: true,
          tenantId: true,
          bankTransaction: { select: { amount: true } },
        },
      },
      dte: {
        select: { totalAmount: true, amountPaid: true, tenantId: true },
      },
    },
  });

  if (allocs.length === 0) return [];

  const dteToBankTxs = new Map<string, Set<string>>();
  const bankTxToDtes = new Map<string, Set<string>>();
  const tenantByDte = new Map<string, string>();
  const dteTotal = new Map<string, number>();
  const dtePaid = new Map<string, number>();
  const allocPerDteBank = new Map<string, number>(); // `${dteId}|${bankTxId}` → sum amount
  const bankAmountById = new Map<string, number>();
  for (const a of allocs) {
    if (!a.payment.bankTransactionId) continue;
    tenantByDte.set(a.dteId, a.dte.tenantId);
    dteTotal.set(a.dteId, Number(a.dte.totalAmount));
    dtePaid.set(a.dteId, Number(a.dte.amountPaid));
    const dt = dteToBankTxs.get(a.dteId) ?? new Set<string>();
    dt.add(a.payment.bankTransactionId);
    dteToBankTxs.set(a.dteId, dt);
    const bd = bankTxToDtes.get(a.payment.bankTransactionId) ?? new Set<string>();
    bd.add(a.dteId);
    bankTxToDtes.set(a.payment.bankTransactionId, bd);
    const key = `${a.dteId}|${a.payment.bankTransactionId}`;
    allocPerDteBank.set(key, (allocPerDteBank.get(key) ?? 0) + Number(a.amount));
    if (a.payment.bankTransaction) {
      bankAmountById.set(
        a.payment.bankTransactionId,
        Math.abs(Number(a.payment.bankTransaction.amount)),
      );
    }
  }

  const visited = new Set<string>();
  const lotes: LoteCandidate[] = [];
  for (const startDte of dteToBankTxs.keys()) {
    if (visited.has(startDte)) continue;
    const dtes = new Set<string>();
    const banks = new Set<string>();
    const queue = [startDte];
    while (queue.length > 0) {
      const d = queue.shift()!;
      if (dtes.has(d)) continue;
      dtes.add(d);
      visited.add(d);
      for (const b of dteToBankTxs.get(d) ?? []) {
        if (banks.has(b)) continue;
        banks.add(b);
        for (const d2 of bankTxToDtes.get(b) ?? []) {
          if (!dtes.has(d2)) queue.push(d2);
        }
      }
    }

    const tenantId = tenantByDte.get(startDte)!;
    const totalBank = Array.from(banks).reduce(
      (s, b) => s + (bankAmountById.get(b) ?? 0),
      0,
    );
    // sum de allocations de los DTEs del lote QUE VIENEN de los bank-txs
    // del lote (excluye allocations posteriores manuales o de otros lotes).
    let totalAllocFromLote = 0;
    for (const d of dtes) {
      for (const b of banks) {
        totalAllocFromLote += allocPerDteBank.get(`${d}|${b}`) ?? 0;
      }
    }
    const shortfall = totalAllocFromLote - totalBank;
    if (shortfall <= 1) continue;
    // Sanity: la diferencia no debería ser absurda — la heurística asume
    // un costo (≤5% del total). Si es mayor, lo reportamos pero no
    // aplicamos sin --force.
    const totalDteAmount = Array.from(dtes).reduce(
      (s, id) => s + (dteTotal.get(id) ?? 0),
      0,
    );
    if (shortfall / totalBank > 0.05) {
      console.warn(
        `  [warn] lote con shortfall ${((shortfall / totalBank) * 100).toFixed(1)}% > 5% — skip`,
      );
      continue;
    }
    lotes.push({
      tenantId,
      dteIds: Array.from(dtes),
      bankTxIds: Array.from(banks),
      totalBank,
      totalDteAmount,
      shortfall,
    });
  }
  return lotes;
}

async function resolveDiffAccount(
  tenantId: string,
  explicit: string | null,
): Promise<{ id: string; name: string } | null> {
  if (explicit) {
    return prisma.financeAccountPlan.findFirst({
      where: { id: explicit, tenantId },
      select: { id: true, name: true },
    });
  }
  return prisma.financeAccountPlan.findFirst({
    where: {
      tenantId,
      name: { contains: "factoring", mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
}

async function applyLote(
  lote: LoteCandidate,
  diffAccount: { id: string; name: string },
  userId: string,
): Promise<void> {
  const { tenantId, bankTxIds, shortfall } = lote;

  // En el caso del usuario, las allocations YA cubren el total bruto de
  // los DTEs (las facturas están PAID, aunque haya overflow vs banco).
  // No tocamos allocations — solo registramos el costo contable.
  // Recomputamos los DTEs por si el redondeo viejo dejó alguno con
  // centavos de diferencia.
  await prisma.$transaction(async (tx) => {
    for (const dteId of lote.dteIds) {
      const dte = await tx.financeDte.findUnique({
        where: { id: dteId },
        select: { totalAmount: true },
      });
      if (!dte) continue;
      const agg = await tx.financePaymentAllocation.aggregate({
        where: { dteId },
        _sum: { amount: true },
      });
      const paid = agg._sum.amount ? Number(agg._sum.amount) : 0;
      const total = Number(dte.totalAmount);
      const pending = Math.max(0, total - paid);
      // Tolerancia $5 para absorber redondeo viejo.
      const status =
        paid + 5 >= total ? "PAID" : paid <= 0 ? "UNPAID" : "PARTIAL";
      await tx.financeDte.update({
        where: { id: dteId },
        data: {
          amountPaid: new Decimal(paid),
          amountPending: new Decimal(pending),
          paymentStatus: status,
        },
      });
    }
  });

  // 2. Generar asiento contable (DEBE Costo Factoring / HABER Banco).
  //    Necesita la cuenta del banco. Tomamos el bank-tx más antiguo del lote.
  const bankTx = await prisma.financeBankTransaction.findFirst({
    where: { id: { in: bankTxIds }, tenantId },
    select: {
      id: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
    },
    orderBy: { transactionDate: "asc" },
  });
  if (!bankTx) throw new Error("No se encontró bank-tx del lote");
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: bankTx.bankAccountId, tenantId },
    select: { accountPlanId: true, bankName: true, accountNumber: true },
  });
  if (bankAccount?.accountPlanId) {
    try {
      await createManualEntry(tenantId, userId, {
        date: bankTx.transactionDate.toISOString().slice(0, 10),
        description: `Promoción retroactiva a shortfall · ${diffAccount.name}`,
        reference: bankTx.reference ?? undefined,
        sourceType: "RECONCILIATION",
        sourceId: bankTx.id,
        lines: [
          {
            accountId: diffAccount.id,
            description: `Costo factoring (regen)`,
            debit: Math.round(shortfall),
            credit: 0,
          },
          {
            accountId: bankAccount.accountPlanId,
            description: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
            debit: 0,
            credit: Math.round(shortfall),
          },
        ],
      });
    } catch (err) {
      console.warn(
        `  [warn] no se generó asiento para lote: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // 3. Materializar en cashflow (items AJUSTE por bank-tx del lote).
  const allBankTxs = await prisma.financeBankTransaction.findMany({
    where: { id: { in: bankTxIds }, tenantId },
    select: {
      id: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
    },
  });
  await materializeShortfallInCashflow(tenantId, userId, {
    txs: allBankTxs,
    isIncome: Number(bankTx.amount) > 0,
    diffAmount: shortfall,
    diffAccountId: diffAccount.id,
    diffLabel: "Costo factoring (regen)",
  });
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const diffArg = args.find((a) => a.startsWith("--diff-account="));
  const userArg = args.find((a) => a.startsWith("--user-id="));
  const explicitDiffId = diffArg ? diffArg.split("=")[1] : null;
  const userId = userArg ? userArg.split("=")[1] : null;

  console.log(`[upgrade-partial-to-shortfall] mode=${apply ? "APPLY" : "DRY-RUN"}`);
  if (apply && !userId) {
    console.error("--user-id=<adminId> es obligatorio en modo --apply");
    process.exit(1);
  }

  const lotes = await findLotes();
  if (lotes.length === 0) {
    console.log("No hay lotes PARTIAL con shortfall ≤5% detectados.");
    return;
  }

  console.log(`\nLotes detectados: ${lotes.length}\n`);
  for (const lote of lotes) {
    const diffAccount = await resolveDiffAccount(lote.tenantId, explicitDiffId);
    const pct = ((lote.shortfall / lote.totalDteAmount) * 100).toFixed(2);
    console.log(
      `Tenant ${lote.tenantId.slice(0, 8)}… · DTEs=${lote.dteIds.length} · Banks=${lote.bankTxIds.length}`,
    );
    console.log(
      `  totalBank=$${lote.totalBank.toLocaleString("es-CL")}  totalDte=$${lote.totalDteAmount.toLocaleString("es-CL")}  shortfall=$${lote.shortfall.toLocaleString("es-CL")} (${pct}%)`,
    );
    console.log(
      `  diffAccount: ${diffAccount ? `${diffAccount.name} (${diffAccount.id})` : "❌ NO ENCONTRADA — pasá --diff-account=<id>"}`,
    );

    if (apply && diffAccount && userId) {
      try {
        await applyLote(lote, diffAccount, userId);
        console.log("  ✓ promovido");
      } catch (err) {
        console.error(`  ✗ falló: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (!apply) {
    console.log(`\n(Dry-run; rerun con --apply para promover.)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
