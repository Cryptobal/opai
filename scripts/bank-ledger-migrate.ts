/**
 * Migración al libro mayor bancario — DRY-RUN por defecto.
 *
 * Para cada cuenta bancaria activa (opcionalmente filtrada por tenant/cuenta):
 *   1. Si no tiene saldo inicial (OPENING), propone uno: el cierre de cartola
 *      (snapshot IMPORT) más antiguo; si no hay, la lectura MANUAL más antigua
 *      cuya fecha sea anterior al primer movimiento visible o, en su defecto,
 *      la más antigua disponible (con advertencia: puede ser intradía).
 *   2. Calcula el ledger (opening + Σ movimientos visibles) a la fecha de cada
 *      lectura histórica (MANUAL / IMPORT / CALCULATED) y reporta el delta:
 *      lectura − ledger. Cualquier delta ≠ 0 es un movimiento faltante o
 *      duplicado alrededor de esa fecha.
 *   3. Con `--apply` escribe el OPENING propuesto y resincroniza currentBalance.
 *      NUNCA oculta ni ajusta movimientos.
 *
 * Uso:
 *   npx tsx scripts/bank-ledger-migrate.ts                 # dry-run, todas las cuentas
 *   npx tsx scripts/bank-ledger-migrate.ts --tenant=<id>   # solo un tenant
 *   npx tsx scripts/bank-ledger-migrate.ts --account=<id>  # solo una cuenta
 *   npx tsx scripts/bank-ledger-migrate.ts --apply         # escribe OPENING
 *
 * Requiere DATABASE_URL / DIRECT_DATABASE_URL apuntando a la BD objetivo.
 * Contra producción: solo con autorización explícita (CLAUDE.md §19/§29).
 */

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

const args = new Map<string, string | boolean>();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1]!, m[2] ?? true);
}
const APPLY = args.get("apply") === true;
const TENANT = typeof args.get("tenant") === "string" ? String(args.get("tenant")) : null;
const ACCOUNT = typeof args.get("account") === "string" ? String(args.get("account")) : null;

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const clp = (n: number) => `$${fmt.format(Math.round(n))}`;

interface Proposal {
  asOfDate: Date;
  balance: number;
  source: string;
  warning: string | null;
}

async function proposeOpening(
  tenantId: string,
  bankAccountId: string,
): Promise<Proposal | null> {
  const firstTx = await prisma.financeBankTransaction.findFirst({
    where: { tenantId, bankAccountId, hiddenAt: null },
    orderBy: { transactionDate: "asc" },
    select: { transactionDate: true },
  });

  const oldestImport = await prisma.financeBankAccountBalance.findFirst({
    where: { tenantId, bankAccountId, source: "IMPORT" },
    orderBy: [{ asOfDate: "asc" }, { createdAt: "asc" }],
    select: { asOfDate: true, balance: true },
  });
  if (oldestImport) {
    return {
      asOfDate: oldestImport.asOfDate,
      balance: Number(oldestImport.balance),
      source: "IMPORT (cierre de la primera cartola)",
      warning:
        firstTx && firstTx.transactionDate < oldestImport.asOfDate
          ? `hay ${await countTxBefore(tenantId, bankAccountId, oldestImport.asOfDate)} movimientos anteriores al cierre que quedan dentro del saldo inicial (correcto si la cartola los incluye)`
          : null,
    };
  }

  const manualBeforeFirstTx = firstTx
    ? await prisma.financeBankAccountBalance.findFirst({
        where: {
          tenantId,
          bankAccountId,
          source: { in: ["MANUAL", "CALCULATED"] },
          asOfDate: { lt: firstTx.transactionDate },
        },
        orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
        select: { asOfDate: true, balance: true, source: true },
      })
    : null;
  if (manualBeforeFirstTx) {
    return {
      asOfDate: manualBeforeFirstTx.asOfDate,
      balance: Number(manualBeforeFirstTx.balance),
      source: `${manualBeforeFirstTx.source} anterior al primer movimiento`,
      warning: null,
    };
  }

  const oldestAny = await prisma.financeBankAccountBalance.findFirst({
    where: { tenantId, bankAccountId, source: { not: "OPENING" } },
    orderBy: [{ asOfDate: "asc" }, { createdAt: "asc" }],
    select: { asOfDate: true, balance: true, source: true },
  });
  if (oldestAny) {
    return {
      asOfDate: oldestAny.asOfDate,
      balance: Number(oldestAny.balance),
      source: `${oldestAny.source} más antigua`,
      warning:
        "lectura posiblemente intradía: los movimientos de ese mismo día posteriores a la lectura quedarían fuera. Validar contra la cartola del día.",
    };
  }
  return null;
}

async function countTxBefore(tenantId: string, bankAccountId: string, date: Date) {
  return prisma.financeBankTransaction.count({
    where: { tenantId, bankAccountId, hiddenAt: null, transactionDate: { lte: date } },
  });
}

async function ledgerAt(
  tenantId: string,
  bankAccountId: string,
  opening: { asOfDate: Date; balance: number },
  cutoff: Date,
): Promise<{ balance: number; txCount: number } | null> {
  if (cutoff < opening.asOfDate) return null;
  const agg = await prisma.financeBankTransaction.aggregate({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: { gt: opening.asOfDate, lte: cutoff },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return {
    balance: opening.balance + Number(agg._sum.amount ?? 0),
    txCount: agg._count._all,
  };
}

async function main() {
  console.log(`bank-ledger-migrate · modo ${APPLY ? "APPLY" : "DRY-RUN"}${TENANT ? ` · tenant=${TENANT}` : ""}${ACCOUNT ? ` · account=${ACCOUNT}` : ""}\n`);

  const accounts = await prisma.financeBankAccount.findMany({
    where: {
      isActive: true,
      ...(TENANT ? { tenantId: TENANT } : {}),
      ...(ACCOUNT ? { id: ACCOUNT } : {}),
    },
    select: { id: true, tenantId: true, bankName: true, accountNumber: true, currentBalance: true },
    orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
  });

  for (const acc of accounts) {
    console.log(`== ${acc.tenantId} · ${acc.bankName} ${acc.accountNumber} (${acc.id})`);
    console.log(`   currentBalance (cache): ${clp(Number(acc.currentBalance ?? 0))}`);

    let opening = await prisma.financeBankAccountBalance.findFirst({
      where: { tenantId: acc.tenantId, bankAccountId: acc.id, source: "OPENING" },
      orderBy: { createdAt: "desc" },
      select: { asOfDate: true, balance: true },
    });
    let openingInfo = opening
      ? { asOfDate: opening.asOfDate, balance: Number(opening.balance) }
      : null;

    if (openingInfo) {
      console.log(`   OPENING existente: ${ymd(openingInfo.asOfDate)} ${clp(openingInfo.balance)}`);
    } else {
      const proposal = await proposeOpening(acc.tenantId, acc.id);
      if (!proposal) {
        console.log("   Sin lecturas ni cartolas: no se puede proponer saldo inicial. Definirlo a mano en Cuadratura.\n");
        continue;
      }
      console.log(
        `   OPENING propuesto: ${ymd(proposal.asOfDate)} ${clp(proposal.balance)} · origen ${proposal.source}` +
          (proposal.warning ? `\n   ⚠ ${proposal.warning}` : ""),
      );
      if (APPLY) {
        opening = await prisma.financeBankAccountBalance.create({
          data: {
            tenantId: acc.tenantId,
            bankAccountId: acc.id,
            asOfDate: proposal.asOfDate,
            balance: new Decimal(proposal.balance),
            source: "OPENING",
            note: `Saldo inicial migrado desde ${proposal.source}.`,
          },
          select: { asOfDate: true, balance: true },
        });
        console.log("   ✔ OPENING creado");
      }
      openingInfo = { asOfDate: proposal.asOfDate, balance: proposal.balance };
    }

    const today = new Date(new Date().toISOString().slice(0, 10));
    const ledgerToday = await ledgerAt(acc.tenantId, acc.id, openingInfo, today);
    console.log(
      `   Ledger hoy: ${ledgerToday ? `${clp(ledgerToday.balance)} (${ledgerToday.txCount} mov.)` : "n/a"}` +
        (ledgerToday
          ? ` · delta vs cache ${clp(ledgerToday.balance - Number(acc.currentBalance ?? 0))}`
          : ""),
    );

    const readings = await prisma.financeBankAccountBalance.findMany({
      where: { tenantId: acc.tenantId, bankAccountId: acc.id, source: { not: "OPENING" } },
      orderBy: [{ asOfDate: "asc" }, { createdAt: "asc" }],
      select: { asOfDate: true, balance: true, source: true, note: true },
    });
    if (readings.length > 0) {
      console.log("   Lecturas históricas vs ledger:");
      console.log("   fecha        fuente       lectura           ledger            delta");
      for (const r of readings) {
        const l = await ledgerAt(acc.tenantId, acc.id, openingInfo, r.asOfDate);
        const reading = Number(r.balance);
        const delta = l ? reading - l.balance : null;
        const flag = delta == null ? "  " : Math.abs(delta) >= 1 ? "⚠ " : "  ";
        console.log(
          `   ${flag}${ymd(r.asOfDate)}  ${r.source.padEnd(11)} ${clp(reading).padStart(16)} ${(l ? clp(l.balance) : "n/a").padStart(16)} ${(delta == null ? "n/a" : clp(delta)).padStart(16)}`,
        );
      }
    }

    if (APPLY && opening) {
      await prisma.financeBankAccount.update({
        where: { id: acc.id },
        data: {
          currentBalance: ledgerToday ? new Decimal(ledgerToday.balance) : undefined,
          balanceUpdatedAt: new Date(),
        },
      });
      console.log("   ✔ currentBalance resincronizado con el ledger");
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN: no se escribió nada. Repetir con --apply para crear los OPENING propuestos.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
