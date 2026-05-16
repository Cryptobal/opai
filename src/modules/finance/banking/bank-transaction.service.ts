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
import { recognizeRutsForTransactions } from "./rut-recognition.service";

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
 * Construye el `OR` del where para búsqueda en `description`, `reference`
 * y `amount`.
 *
 * Caso especial RUT chileno: el banco a veces emite el RUT con puntos y a
 * veces sin. Si el input parece un RUT (solo dígitos, opcional dígito
 * verificador K, puntos o guion), generamos todas las variantes razonables
 * (con/sin puntos, con/sin guion, con/sin DV) y matcheamos cualquiera. Así
 * el usuario puede escribir solo los dígitos y encontrar descripciones que
 * traen el RUT formateado con puntos y guion.
 *
 * Caso especial monto: si el input es solo dígitos (sin puntos, sin guion),
 * también buscamos por `amount` exacto para que el usuario pueda buscar
 * "339960" y encontrar el movimiento.
 */
function buildSearchOr(search: string) {
  const trimmed = search.trim();

  // Monto puro: solo dígitos (sin separadores de RUT). Ej: "339960".
  // También soporta monto con puntos de miles estilo chileno: "339.960".
  const cleanedNumeric = trimmed.replace(/\./g, "").replace(/,/g, "");
  const looksLikeAmount =
    /^\d+$/.test(cleanedNumeric) &&
    cleanedNumeric.length >= 3 &&
    cleanedNumeric.length <= 12;

  // Detección de RUT: solo dígitos, puntos, guion, y opcional K final.
  const looksLikeRut = /^[\d.\-kK]+$/.test(trimmed) && /\d{4,9}/.test(trimmed);

  if (!looksLikeRut) {
    const or: Array<Record<string, unknown>> = [
      { description: { contains: trimmed, mode: "insensitive" as const } },
      { reference: { contains: trimmed, mode: "insensitive" as const } },
    ];
    if (looksLikeAmount) {
      const num = parseFloat(cleanedNumeric);
      if (!isNaN(num)) {
        or.push({ amount: num });
        or.push({ amount: -num });
      }
    }
    return or;
  }

  const cleaned = trimmed.replace(/[.\-]/g, "");
  const dvMatch = cleaned.match(/^(\d{4,9})([kK])?$/);
  if (!dvMatch) {
    const or: Array<Record<string, unknown>> = [
      { description: { contains: trimmed, mode: "insensitive" as const } },
      { reference: { contains: trimmed, mode: "insensitive" as const } },
    ];
    if (looksLikeAmount) {
      const num = parseFloat(cleanedNumeric);
      if (!isNaN(num)) {
        or.push({ amount: num });
        or.push({ amount: -num });
      }
    }
    return or;
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

  const or: Array<Record<string, unknown>> = [];
  for (const v of variants) {
    or.push({ description: { contains: v, mode: "insensitive" as const } });
    or.push({ reference: { contains: v, mode: "insensitive" as const } });
  }
  // También buscar por monto si los dígitos del RUT coinciden numéricamente.
  if (looksLikeAmount) {
    const num = parseFloat(cleanedNumeric);
    if (!isNaN(num)) {
      or.push({ amount: num });
      or.push({ amount: -num });
    }
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
  /**
   * Por defecto el listado excluye movimientos ocultos (soft-deleted con
   * motivo). Setear true para mostrar SOLO los ocultos; false (default)
   * para los no-ocultos. "all" para ambos.
   */
  visibility?: "visible" | "hidden" | "all";
  /**
   * Sub-tab de Movimientos:
   *   - "all" (default): todas las visibles
   *   - "recognized": tx UNMATCHED con sugerencia de regla pendiente
   *   - "unrecognized": tx UNMATCHED sin sugerencia
   *   - "matched": tx ya conciliadas (MATCHED/RECONCILED)
   */
  tab?: "all" | "recognized" | "unrecognized" | "matched";
  /**
   * Filtro por signo del monto (post 2026-05):
   *   - "inflow":  amount > 0 (ingresos)
   *   - "outflow": amount < 0 (egresos)
   *   - "all" (default): sin filtro
   */
  direction?: "inflow" | "outflow" | "all";
}

export interface ImportTransactionInput {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number;
  branch?: string | null;
}

/**
 * Resultado de un preview de cartola: separa qué se importaría como nuevo
 * vs qué ya existe en BD (y por lo tanto sería omitido por skipDuplicates).
 * El cliente puede mostrar este desglose y pedir confirmación antes de
 * llamar al import real.
 */
export interface ImportPreviewResult {
  totalInFile: number;
  newCount: number;
  duplicateCount: number;
  new: PreviewRow[];
  duplicates: PreviewRow[];
  accountNumberInFile: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  closingBalance: number | null;
}

export interface PreviewRow {
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
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

  const visibility = opts?.visibility ?? "visible";
  if (visibility === "visible") {
    where.hiddenAt = null;
  } else if (visibility === "hidden") {
    where.hiddenAt = { not: null };
  } // "all" no agrega filtro

  const tab = opts?.tab ?? "all";
  if (tab === "recognized") {
    where.reconciliationStatus = "UNMATCHED";
    where.suggestedAccountPlanId = { not: null };
  } else if (tab === "unrecognized") {
    where.reconciliationStatus = "UNMATCHED";
    where.suggestedAccountPlanId = null;
  } else if (tab === "matched") {
    where.reconciliationStatus = { in: ["MATCHED", "RECONCILED"] };
  }

  // Filtro por signo del monto. Postgres permite filtrar Decimal con
  // comparadores numéricos directamente; Prisma lo maneja como `gt`/`lt`
  // numéricos sin pasar por Decimal.
  const direction = opts?.direction ?? "all";
  if (direction === "inflow") {
    where.amount = { gt: 0 };
  } else if (direction === "outflow") {
    where.amount = { lt: 0 };
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
                WHERE t2.tenant_id::text = ${tenantId}
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
          AND t.tenant_id::text = ${tenantId}
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

  // Enrichment: para tx con sugerencia, traer nombre de la regla y de la
  // cuenta contable sugerida en una sola query batch (evita N+1).
  const ruleIds = Array.from(
    new Set(
      transactions
        .map((t) => t.suggestedRuleId)
        .filter((v): v is string => typeof v === "string")
    )
  );
  const accountIds = Array.from(
    new Set(
      transactions
        .map((t) => t.suggestedAccountPlanId)
        .filter((v): v is string => typeof v === "string")
    )
  );
  const [rules, accounts] = await Promise.all([
    ruleIds.length > 0
      ? prisma.financeAutoMatchRule.findMany({
          where: { tenantId, id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    accountIds.length > 0
      ? prisma.financeAccountPlan.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([] as { id: string; code: string; name: string }[]),
  ]);
  const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
  const accountMap = new Map(
    accounts.map((a) => [a.id, `${a.code} ${a.name}`])
  );

  // RUT recognition: para la página visible cruzamos cada movimiento con
  // CrmAccount / FinanceSupplier / OpsGuardia del tenant. Una pasada (3
  // queries batch totales, no por fila). Si no se detecta RUT o no
  // matchea con ninguna entidad → kind="unknown".
  const rutMap = await recognizeRutsForTransactions(
    tenantId,
    transactions.map((t) => ({
      id: t.id,
      description: t.description ?? null,
      reference: t.reference ?? null,
    })),
  );

  const enriched = transactions.map((t) => ({
    ...t,
    suggestedRuleName: t.suggestedRuleId
      ? ruleMap.get(t.suggestedRuleId) ?? null
      : null,
    suggestedAccountLabel: t.suggestedAccountPlanId
      ? accountMap.get(t.suggestedAccountPlanId) ?? null
      : null,
    rutRecognition: rutMap.get(t.id) ?? null,
  }));

  return {
    transactions: enriched,
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
export interface ImportMetadata {
  fileName: string;
  fileSize: number;
  bankFormat: string;
  accountNumberInFile?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
}

export async function importBankTransactions(
  tenantId: string,
  bankAccountId: string,
  transactions: ImportTransactionInput[],
  closingBalance?: number | null,
  userId?: string,
  metadata?: ImportMetadata,
): Promise<{
  importedCount: number;
  duplicateCount: number;
  importId: string | null;
  autoMatch?: BulkAutoMatchSummary;
  /** True si el auto-match alcanzó el cap defensivo de 500 — puede haber tx sin procesar. */
  reachedAutoMatchCap?: boolean;
}> {
  // Verify bank account exists and belongs to tenant
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
  });
  if (!bankAccount) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  if (transactions.length === 0) {
    return { importedCount: 0, duplicateCount: 0, importId: null };
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

  const duplicateCount = transactions.length - result.count;

  // Historial de cartola: solo lo creamos cuando hubo importación efectiva
  // (count > 0). Si todo eran duplicados, no dejamos rastro porque no aporta
  // valor — el usuario ya recibió el feedback en el preview.
  let importId: string | null = null;
  if (result.count > 0 && metadata) {
    const statementImport = await prisma.financeBankStatementImport.create({
      data: {
        tenantId,
        bankAccountId,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        bankFormat: metadata.bankFormat,
        accountNumberInFile: metadata.accountNumberInFile ?? null,
        periodFrom: metadata.periodFrom ? new Date(metadata.periodFrom) : null,
        periodTo: metadata.periodTo ? new Date(metadata.periodTo) : null,
        totalInFile: transactions.length,
        importedCount: result.count,
        duplicateCount,
        closingBalance:
          closingBalance !== null && closingBalance !== undefined
            ? new Decimal(closingBalance)
            : null,
        createdById: userId ?? null,
      },
    });
    importId = statementImport.id;

    // Enlazamos las transacciones recién insertadas a esta cartola.
    // Las identificamos por sus apiTransactionId (únicos por cuenta) y filtramos
    // las que aún no tienen importId (las "nuevas" recién creadas). Esto evita
    // sobreescribir el importId de movimientos preexistentes que pudieran
    // compartir apiTransactionId (no debería pasar por el unique key, pero
    // defensa en profundidad).
    const apiTransactionIds = data.map((d) => d.apiTransactionId);
    await prisma.financeBankTransaction.updateMany({
      where: {
        tenantId,
        bankAccountId,
        apiTransactionId: { in: apiTransactionIds },
        importId: null,
      },
      data: { importId },
    });
  }

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
  let reachedAutoMatchCap = false;
  if (userId && result.count > 0) {
    // Tomamos las UNMATCHED de esta cuenta como targets del bulk match.
    // En la práctica, el bulk insert recién las creó; las que ya estaban
    // UNMATCHED de antes también se intentan (es safe: idempotente).
    // Incluimos cobros y pagos: el matcher distingue por signo y busca
    // DTEs ISSUED para ingresos / RECEIVED para egresos. Las que no
    // matchean por DTE pasan al motor de reglas configurables.
    const fresh = await prisma.financeBankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        reconciliationStatus: "UNMATCHED",
        hiddenAt: null,
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
    reachedAutoMatchCap = fresh.length === 500;
  }

  return {
    importedCount: result.count,
    duplicateCount,
    importId,
    autoMatch,
    reachedAutoMatchCap,
  };
}

/**
 * Pre-chequeo de importación: parsea las transacciones, calcula sus
 * apiTransactionId determinísticos y consulta BD para separar nuevos vs
 * duplicados. No escribe nada. La UI lo usa para mostrar al usuario qué se
 * va a importar y qué se va a omitir antes de confirmar.
 */
export async function previewBankStatementImport(
  tenantId: string,
  bankAccountId: string,
  transactions: ImportTransactionInput[],
  metadata: {
    accountNumberInFile?: string | null;
    periodFrom?: string | null;
    periodTo?: string | null;
    closingBalance?: number | null;
  },
): Promise<ImportPreviewResult> {
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { id: true },
  });
  if (!bankAccount) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  // Para cada transacción del archivo, calculamos su apiTransactionId con la
  // misma lógica que importBankTransactions (incluyendo occurrenceIdx para
  // duplicados legítimos intra-archivo).
  const occurrenceCounts = new Map<string, number>();
  const enriched = transactions.map((tx) => {
    const baseKey = [
      tx.transactionDate,
      tx.amount.toString(),
      (tx.description ?? "").trim(),
      tx.reference ?? "",
    ].join("|");
    const occ = occurrenceCounts.get(baseKey) ?? 0;
    occurrenceCounts.set(baseKey, occ + 1);
    return { tx, apiTransactionId: buildImportTxId(tx, occ) };
  });

  // Buscamos cuáles de esos apiTransactionId ya existen en BD para esta cuenta.
  const existing = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      apiTransactionId: { in: enriched.map((e) => e.apiTransactionId) },
    },
    select: { apiTransactionId: true },
  });
  const existingSet = new Set(
    existing.map((e) => e.apiTransactionId).filter((id): id is string => !!id),
  );

  const toRow = (tx: ImportTransactionInput): PreviewRow => ({
    transactionDate: tx.transactionDate,
    description: tx.description,
    reference: tx.reference ?? null,
    amount: tx.amount,
  });

  const newRows: PreviewRow[] = [];
  const duplicateRows: PreviewRow[] = [];
  for (const { tx, apiTransactionId } of enriched) {
    if (existingSet.has(apiTransactionId)) duplicateRows.push(toRow(tx));
    else newRows.push(toRow(tx));
  }

  return {
    totalInFile: transactions.length,
    newCount: newRows.length,
    duplicateCount: duplicateRows.length,
    new: newRows,
    duplicates: duplicateRows,
    accountNumberInFile: metadata.accountNumberInFile ?? null,
    periodFrom: metadata.periodFrom ?? null,
    periodTo: metadata.periodTo ?? null,
    closingBalance: metadata.closingBalance ?? null,
  };
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

/**
 * Soft-delete: marca un movimiento como oculto con un motivo. Queda fuera
 * del listado por defecto pero auditable. La conciliación se desvincula
 * (status vuelve a UNMATCHED) para no contaminar reportes.
 */
export async function hideTransaction(
  tenantId: string,
  txId: string,
  userId: string | null,
  reason: string
): Promise<void> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId },
    select: { id: true, hiddenAt: true },
  });
  if (!tx) throw new Error("Movimiento no encontrado");
  if (tx.hiddenAt) return; // ya oculto, idempotente

  await prisma.financeBankTransaction.update({
    where: { id: txId },
    data: {
      hiddenAt: new Date(),
      hiddenById: userId ?? null,
      hiddenReason: reason.trim().slice(0, 500),
      reconciliationStatus: "UNMATCHED",
      reconciliationId: null,
    },
  });
}

/**
 * Oculta múltiples movimientos en una sola transacción. Ignora silenciosamente
 * los IDs ya ocultos o no existentes (no aborta el batch). Devuelve la cuenta
 * de los efectivamente ocultados.
 */
export async function bulkHideTransactions(
  tenantId: string,
  txIds: string[],
  userId: string | null,
  reason: string
): Promise<number> {
  if (txIds.length === 0) return 0;
  const trimmedReason = reason.trim().slice(0, 500);
  if (!trimmedReason) throw new Error("Motivo requerido");

  const result = await prisma.financeBankTransaction.updateMany({
    where: { tenantId, id: { in: txIds }, hiddenAt: null },
    data: {
      hiddenAt: new Date(),
      hiddenById: userId ?? null,
      hiddenReason: trimmedReason,
      reconciliationStatus: "UNMATCHED",
      reconciliationId: null,
    },
  });
  return result.count;
}

/**
 * Restaura un movimiento previamente oculto.
 */
export async function unhideTransaction(
  tenantId: string,
  txId: string
): Promise<void> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId },
    select: { id: true, hiddenAt: true },
  });
  if (!tx) throw new Error("Movimiento no encontrado");
  if (!tx.hiddenAt) return;

  await prisma.financeBankTransaction.update({
    where: { id: txId },
    data: { hiddenAt: null, hiddenById: null, hiddenReason: null },
  });
}
