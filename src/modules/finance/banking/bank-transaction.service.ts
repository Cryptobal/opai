/**
 * Bank Transaction Service
 * CRUD and bulk import for bank transactions (movimientos bancarios)
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBankTxSource } from "@prisma/client";

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
 */
export async function importBankTransactions(
  tenantId: string,
  bankAccountId: string,
  transactions: ImportTransactionInput[],
  closingBalance?: number | null
) {
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

  return { importedCount: result.count };
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
