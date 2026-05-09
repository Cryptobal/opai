/**
 * Bank Transaction Service
 * CRUD and bulk import for bank transactions (movimientos bancarios)
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBankTxSource } from "@prisma/client";
import {
  bulkAutoMatchBankTransactions,
  type BulkAutoMatchSummary,
} from "./auto-match-payment.service";

/**
 * Genera un `apiTransactionId` determinístico para una transacción importada
 * desde cartola CSV/XLSX. Permite que el unique constraint
 *   (tenantId, bankAccountId, apiTransactionId)
 * bloquee re-importaciones de la misma cartola: el mismo movimiento, en el
 * mismo orden, produce el mismo hash → `createMany({ skipDuplicates })` lo
 * salta silenciosamente.
 *
 * Incluye `occurrenceIdx` para permitir movimientos legítimamente duplicados
 * dentro del mismo archivo (ej. dos transferencias idénticas el mismo día).
 */
function buildImportTxId(
  tx: ImportTransactionInput,
  occurrenceIdx: number
): string {
  const key = [
    tx.transactionDate,
    tx.amount.toString(),
    (tx.description ?? "").trim(),
    tx.reference ?? "",
    occurrenceIdx,
  ].join("|");
  const hash = crypto.createHash("sha1").update(key).digest("hex");
  return `csv:${hash}`;
}

/** Inserta puntos cada 3 dígitos desde la derecha (formateo de RUT chileno). */
function formatDigitsWithDots(digits: string): string {
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    groups.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return groups.join(".");
}

/**
 * Construye el `OR` del where para búsqueda en `description` y `reference`.
 *
 * Caso especial RUT chileno: el banco a veces emite el RUT con puntos y a
 * veces sin. Si el input parece un RUT (solo dígitos, opcional dígito
 * verificador K, puntos o guion), generamos todas las variantes razonables
 * (con/sin puntos, con/sin guion, con/sin DV) y matcheamos cualquiera. Así
 * el usuario puede escribir solo los dígitos y encontrar descripciones que
 * traen el RUT formateado con puntos y guion.
 */
function buildSearchOr(search: string) {
  const trimmed = search.trim();
  // Detección de RUT: solo dígitos, puntos, guion, y opcional K final.
  const looksLikeRut = /^[\d.\-kK]+$/.test(trimmed) && /\d{4,9}/.test(trimmed);
  if (!looksLikeRut) {
    return [
      { description: { contains: trimmed, mode: "insensitive" as const } },
      { reference: { contains: trimmed, mode: "insensitive" as const } },
    ];
  }

  const cleaned = trimmed.replace(/[.\-]/g, "");
  const dvMatch = cleaned.match(/^(\d{4,9})([kK])?$/);
  if (!dvMatch) {
    return [
      { description: { contains: trimmed, mode: "insensitive" as const } },
      { reference: { contains: trimmed, mode: "insensitive" as const } },
    ];
  }
  const digits = dvMatch[1];
  const dv = dvMatch[2]?.toUpperCase() ?? null;
  const dotted = formatDigitsWithDots(digits);

  // Variantes generadas: dígitos planos, dígitos con puntos, y si hay
  // DV: con guion (en ambos formatos) y DV pegado al final.
  const variants = new Set<string>();
  variants.add(digits);
  variants.add(dotted);
  if (dv) {
    variants.add(`${digits}-${dv}`);
    variants.add(`${dotted}-${dv}`);
    variants.add(`${digits}${dv}`);
  }

  const or: Array<
    | { description: { contains: string; mode: "insensitive" } }
    | { reference: { contains: string; mode: "insensitive" } }
  > = [];
  for (const v of variants) {
    or.push({ description: { contains: v, mode: "insensitive" as const } });
    or.push({ reference: { contains: v, mode: "insensitive" as const } });
  }
  return or;
}

// ── Types ──

type BankTxSortField = "transactionDate" | "description" | "amount";
type BankTxSortDir = "asc" | "desc";

interface ListBankTransactionsOpts {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  /** Búsqueda case-insensitive sobre description y reference. */
  search?: string;
  sortBy?: BankTxSortField;
  sortDir?: BankTxSortDir;
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

  const search = opts?.search?.trim();
  if (search) {
    where.OR = buildSearchOr(search);
  }

  // Orden: por defecto fecha descendente, con id como tiebreaker estable.
  const sortField: BankTxSortField = opts?.sortBy ?? "transactionDate";
  const sortDir: BankTxSortDir = opts?.sortDir ?? "desc";
  const orderBy = [
    { [sortField]: sortDir } as Record<string, BankTxSortDir>,
    { id: sortDir } as Record<string, BankTxSortDir>,
  ];

  const [transactions, total] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.financeBankTransaction.count({ where }),
  ]);

  // Running balance: el campo `balance` que entrega Santander viene casi siempre
  // null. Lo calculamos a mano: balance_at_tx_i = currentBalance - Σ(amount de
  // todas las tx más nuevas, cronológicamente, en TODA la cuenta — sin importar
  // filtros del listado).
  //
  // Solo aplica cuando sortField=transactionDate (en otros sorts el balance
  // running por fila no es interpretable). Si la cuenta no tiene currentBalance
  // fijado, dejamos null y la UI muestra "—".
  if (sortField === "transactionDate" && transactions.length > 0) {
    const account = await prisma.financeBankAccount.findFirst({
      where: { id: bankAccountId, tenantId },
      select: { currentBalance: true },
    });
    const currentBalance = account?.currentBalance;
    if (currentBalance != null) {
      type RawRow = { id: string; running: string };
      const ids = transactions.map((t) => t.id);
      // Para cada tx de la página, balance = currentBalance - Σ(amount de
      // las txs estrictamente más nuevas cronológicamente). El orden
      // canónico es (transaction_date DESC, id DESC); "más nuevas" = mayor
      // (transaction_date, id). Calculado con sub-query correlacionada.
      // tenant_id es String (no uuid), bank_account_id sí es uuid.
      const rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          t.id::text AS id,
          (
            ${currentBalance.toString()}::numeric
            - COALESCE(
              (
                SELECT SUM(t2.amount)
                FROM finance.finance_bank_transactions t2
                WHERE t2.tenant_id = ${tenantId}
                  AND t2.bank_account_id = ${bankAccountId}::uuid
                  AND (
                    t2.transaction_date > t.transaction_date
                    OR (t2.transaction_date = t.transaction_date AND t2.id > t.id)
                  )
              ),
              0
            )
          )::text AS running
        FROM finance.finance_bank_transactions t
        WHERE t.id = ANY(${ids}::uuid[])
          AND t.tenant_id = ${tenantId}
          AND t.bank_account_id = ${bankAccountId}::uuid
      `;
      const balanceMap = new Map(rows.map((r) => [r.id, r.running]));
      for (const tx of transactions) {
        const running = balanceMap.get(tx.id);
        if (running !== undefined) {
          tx.balance = new Decimal(running);
        }
      }
    }
  }

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

  // Build data for createMany — incluye apiTransactionId determinístico para
  // que el unique key (tenantId, bankAccountId, apiTransactionId) bloquee
  // duplicados al re-importar la misma cartola. occurrenceCounts maneja el
  // caso de movimientos legítimamente duplicados dentro del mismo archivo.
  const occurrenceCounts = new Map<string, number>();
  const data = transactions.map((tx) => {
    const baseKey = [
      tx.transactionDate,
      tx.amount.toString(),
      (tx.description ?? "").trim(),
      tx.reference ?? "",
    ].join("|");
    const occ = occurrenceCounts.get(baseKey) ?? 0;
    occurrenceCounts.set(baseKey, occ + 1);
    return {
      tenantId,
      bankAccountId,
      transactionDate: new Date(tx.transactionDate),
      description: tx.description,
      reference: tx.reference ?? null,
      amount: new Decimal(tx.amount),
      source: "CSV_IMPORT" as FinanceBankTxSource,
      reconciliationStatus: "UNMATCHED" as const,
      apiTransactionId: buildImportTxId(tx, occ),
    };
  });

  // Bulk insert — skipDuplicates omite filas que rompan el unique constraint
  // (tenantId, bankAccountId, apiTransactionId), garantizando que reimportar
  // la misma cartola no agregue movimientos duplicados.
  const result = await prisma.financeBankTransaction.createMany({
    data,
    skipDuplicates: true,
  });

  // Update bank account balance if closing balance was provided.
  // Además registra un snapshot IMPORT en el historial para que quede trazable
  // qué cartola fijó qué saldo (la fecha del snapshot es la fecha de la última
  // transacción de la cartola, que aproxima el "Fecha hasta" del extracto).
  if (closingBalance !== null && closingBalance !== undefined) {
    await prisma.financeBankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: new Decimal(closingBalance),
        balanceUpdatedAt: new Date(),
      },
    });
    const lastTxDate = transactions.reduce<string | null>((acc, tx) => {
      if (!acc || tx.transactionDate > acc) return tx.transactionDate;
      return acc;
    }, null);
    if (lastTxDate) {
      await prisma.financeBankAccountBalance.create({
        data: {
          tenantId,
          bankAccountId,
          asOfDate: new Date(lastTxDate),
          balance: new Decimal(closingBalance),
          source: "IMPORT",
          note: `Saldo de cierre de cartola importada (${transactions.length} mov.)`,
          createdById: userId ?? null,
        },
      });
    }
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
