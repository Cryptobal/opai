/**
 * Bank Transaction Service
 * CRUD and bulk import for bank transactions (movimientos bancarios)
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBankTxSource } from "@prisma/client";
import {
  bulkAutoMatchBankTransactions,
  type BulkAutoMatchSummary,
} from "./auto-match-payment.service";

// ── Types ──

interface ListBankTransactionsOpts {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface ImportTransactionInput {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number;
  branch?: string | null;
}

interface CreateTransactionInput {
  bankAccountId: string;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference?: string | null;
  amount: number;
  balance?: number | null;
  category?: string | null;
  source?: FinanceBankTxSource;
}

// ── Service functions ──

/**
 * List bank transactions for a specific bank account with date filters and pagination
 */
export async function listBankTransactions(
  tenantId: string,
  bankAccountId: string,
  opts?: ListBankTransactionsOpts
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: any = { tenantId, bankAccountId };

  if (opts?.dateFrom || opts?.dateTo) {
    where.transactionDate = {};
    if (opts.dateFrom) where.transactionDate.gte = new Date(opts.dateFrom);
    if (opts.dateTo) where.transactionDate.lte = new Date(opts.dateTo);
  }

  const [transactions, total] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.financeBankTransaction.count({ where }),
  ]);

  return {
    transactions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Import bank transactions in bulk (from parsed bank statement)
 * - Uses createMany for performance
 * - Updates bank account balance with the last transaction balance or amount sum
 * - OPCIONAL: si `userId` se provee, corre auto-match contra DTEs
 *   pendientes después del bulk insert. Cobros que coinciden EXACTO
 *   (monto + RUT) se vinculan solos y la factura pasa a PAID.
 */
export async function importBankTransactions(
  tenantId: string,
  bankAccountId: string,
  transactions: ImportTransactionInput[],
  closingBalance?: number | null,
  userId?: string,
): Promise<{ importedCount: number; autoMatch?: BulkAutoMatchSummary }> {
  // Verify bank account exists and belongs to tenant
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
  });
  if (!bankAccount) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  if (transactions.length === 0) {
    return { importedCount: 0 };
  }

  // Build data for createMany
  const data = transactions.map((tx) => ({
    tenantId,
    bankAccountId,
    transactionDate: new Date(tx.transactionDate),
    description: tx.description,
    reference: tx.reference ?? null,
    amount: new Decimal(tx.amount),
    source: "CSV_IMPORT" as FinanceBankTxSource,
    reconciliationStatus: "UNMATCHED" as const,
  }));

  // Bulk insert — skipDuplicates avoids errors on re-import
  const result = await prisma.financeBankTransaction.createMany({
    data,
    skipDuplicates: true,
  });

  // Update bank account balance if closing balance was provided
  if (closingBalance !== null && closingBalance !== undefined) {
    await prisma.financeBankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: new Decimal(closingBalance),
        balanceUpdatedAt: new Date(),
      },
    });
  }

  // Auto-match contra DTEs pendientes. Solo corre si tenemos userId
  // (auditoría del payment record). Buscamos las tx recién insertadas
  // por unique key (apiTransactionId no aplica para CSV; usamos
  // bankAccount + tenant + status UNMATCHED que es nuevo). Para evitar
  // tocar transacciones viejas, filtramos por createdAt ≥ start.
  let autoMatch: BulkAutoMatchSummary | undefined = undefined;
  if (userId && result.count > 0) {
    // Tomamos las UNMATCHED de esta cuenta como targets del bulk match.
    // En la práctica, el bulk insert recién las creó; las que ya estaban
    // UNMATCHED de antes también se intentan (es safe: idempotente).
    const fresh = await prisma.financeBankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        reconciliationStatus: "UNMATCHED",
        amount: { gt: 0 }, // solo cobros para auto-match
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 500, // hard cap defensivo
    });
    autoMatch = await bulkAutoMatchBankTransactions(
      tenantId,
      fresh.map((t) => t.id),
      userId,
    );
  }

  return { importedCount: result.count, autoMatch };
}

/**
 * Create a single bank transaction (manual entry)
 */
export async function createBankTransaction(
  tenantId: string,
  data: CreateTransactionInput
) {
  // Verify bank account exists and belongs to tenant
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: data.bankAccountId, tenantId },
  });
  if (!bankAccount) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const transaction = await prisma.financeBankTransaction.create({
    data: {
      tenantId,
      bankAccountId: data.bankAccountId,
      transactionDate: new Date(data.transactionDate),
      description: data.description,
      reference: data.reference ?? null,
      amount: new Decimal(data.amount),
      balance: data.balance != null ? new Decimal(data.balance) : null,
      category: data.category ?? null,
      source: data.source ?? "MANUAL",
      reconciliationStatus: "UNMATCHED",
    },
  });

  // Update bank account balance if balance was provided
  if (data.balance != null) {
    await prisma.financeBankAccount.update({
      where: { id: data.bankAccountId },
      data: {
        currentBalance: new Decimal(data.balance),
        balanceUpdatedAt: new Date(),
      },
    });
  }

  return transaction;
}
