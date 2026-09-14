/**
 * Bank Ledger Service — saldo bancario como libro mayor.
 *
 * Invariante: el saldo de una cuenta es
 *
 *     saldo(fecha) = OPENING.balance + Σ amount(movimientos visibles con
 *                    OPENING.asOfDate < transactionDate ≤ fecha)
 *
 * donde OPENING es el saldo inicial (saldo al cierre de `asOfDate`) y
 * "visible" significa `hiddenAt IS NULL`. Ninguna otra cosa altera el saldo:
 * ni el estado de conciliación, ni las lecturas del banco, ni el flujo de
 * caja. Solo lo cambian movimientos (importados, manuales o un "ajuste de
 * cuadratura" explícito, visible y auditable) y el propio saldo inicial.
 *
 * Las lecturas del banco (`MANUAL` pegado de la app, `IMPORT` cierre o saldo
 * diario de cartola, `CALCULATED` del proveedor) se registran SIEMPRE y se
 * comparan contra el ledger a esa fecha (`computedBalance`, `deltaClp`).
 * Un delta ≠ 0 significa que falta o sobra un movimiento: se muestra y se
 * alerta, nunca se "arregla" moviendo el saldo.
 *
 * `currentBalance` en `FinanceBankAccount` es solo un cache del ledger a hoy.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBalanceSource } from "@prisma/client";
import {
  utcDateFromYmd,
  ymdInChile,
  addDaysChile,
  todayInChile,
} from "@/lib/dates-cl";
import { DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP } from "@/modules/finance/banking/bank-balance-constants";
import { bankTxContentKey } from "@/modules/finance/banking/bank-tx-content-key";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BankReadingSource = Exclude<FinanceBalanceSource, "OPENING">;

/** Fuentes que son lecturas del banco (todo menos el saldo inicial). */
export const BANK_READING_SOURCES: BankReadingSource[] = [
  "MANUAL",
  "IMPORT",
  "CALCULATED",
];

export const LEDGER_MIGRATION_PENDING_MESSAGE =
  "Migración pendiente: la base de datos no tiene el valor OPENING de FinanceBalanceSource. Aplica `npx prisma migrate deploy` (o `npx prisma db push` en local) — migración 20261228000000_finance_bank_ledger.";

/**
 * True si Postgres rechazó el valor OPENING del enum: el código corre contra
 * una BD donde la migración del ledger todavía no se aplicó.
 */
export function isOpeningEnumMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("FinanceBalanceSource") &&
    (msg.includes("invalid input value for enum") || msg.includes("22P02"))
  );
}

let warnedMigrationPending = false;
function warnLedgerMigrationPending(): void {
  if (warnedMigrationPending) return;
  warnedMigrationPending = true;
  console.error(`[Finance/Banking] ${LEDGER_MIGRATION_PENDING_MESSAGE}`);
}

export interface ResolvedAccountBalance {
  /** Fecha de corte del saldo inicial (OPENING). Null si la cuenta no lo tiene. */
  anchorSnapshotDate: Date | null;
  /** Saldo inicial (o `currentBalance` como fallback si no hay OPENING). */
  anchorBalanceClp: number;
  /** Σ movimientos visibles posteriores al saldo inicial y ≤ corte. */
  txDeltaClp: number;
  txCount: number;
  /** Saldo del ledger al corte. Sin OPENING es el fallback (no confiable). */
  resolvedBalanceClp: number;
  /** "OPENING" cuando hay saldo inicial; null si no. */
  anchorSource: FinanceBalanceSource | null;
  /** True si la cuenta no tiene saldo inicial: el saldo no es un ledger. */
  needsOpening: boolean;
  /** Fecha de corte usada (calendario Chile, YYYY-MM-DD). */
  cutoffYmd: string;
}

export interface BankLedgerOpening {
  id: string;
  asOfDate: Date;
  balance: number;
  note: string | null;
  createdAt: Date;
}

/**
 * Normaliza el corte del ledger a una fecha calendario Chile.
 *   - sin valor → hoy en Chile
 *   - "YYYY-MM-DD" → tal cual
 *   - Date en medianoche UTC exacta (fecha "pura", como las @db.Date) → su
 *     fecha UTC; cualquier otro instante → fecha calendario Chile.
 */
export function ledgerCutoffYmd(asOf?: Date | string | null): string {
  if (asOf == null) return todayInChile();
  if (typeof asOf === "string") {
    const trimmed = asOf.trim();
    if (YMD_RE.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) throw new Error("asOf inválido");
    return ymdInChile(d);
  }
  const isPureUtcDate =
    asOf.getUTCHours() === 0 &&
    asOf.getUTCMinutes() === 0 &&
    asOf.getUTCSeconds() === 0 &&
    asOf.getUTCMilliseconds() === 0;
  return isPureUtcDate ? asOf.toISOString().slice(0, 10) : ymdInChile(asOf);
}

/**
 * Saldo inicial activo de la cuenta (el OPENING más reciente por createdAt).
 * Si la BD aún no conoce el valor OPENING (migración pendiente) devuelve null
 * y lo registra en el log: la cuenta se comporta como "sin saldo inicial" en
 * vez de tumbar Bancos y el flujo de caja.
 */
export async function getLedgerOpening(
  tenantId: string,
  bankAccountId: string,
): Promise<BankLedgerOpening | null> {
  let row: {
    id: string;
    asOfDate: Date;
    balance: Decimal;
    note: string | null;
    createdAt: Date;
  } | null;
  try {
    row = await prisma.financeBankAccountBalance.findFirst({
      where: { tenantId, bankAccountId, source: "OPENING" },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        asOfDate: true,
        balance: true,
        note: true,
        createdAt: true,
      },
    });
  } catch (err) {
    if (isOpeningEnumMissingError(err)) {
      warnLedgerMigrationPending();
      return null;
    }
    throw err;
  }
  if (!row) return null;
  return {
    id: row.id,
    asOfDate: row.asOfDate,
    balance: Number(row.balance),
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * Saldo del ledger a una fecha: OPENING + Σ movimientos visibles con
 * `OPENING.asOfDate < transactionDate ≤ corte`.
 *
 * MATCHED / DTE / flujo no filtran: la plata del banco no depende de a qué
 * documento se concilió. Sin OPENING devuelve `currentBalance` como fallback
 * y `needsOpening: true`.
 */
export async function resolveAccountBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOf?: Date | string,
): Promise<ResolvedAccountBalance> {
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { currentBalance: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const cutoffYmd = ledgerCutoffYmd(asOf);
  const cutoff = utcDateFromYmd(cutoffYmd);
  const opening = await getLedgerOpening(tenantId, bankAccountId);

  if (!opening) {
    const fallback = Number(account.currentBalance ?? 0);
    return {
      anchorSnapshotDate: null,
      anchorBalanceClp: fallback,
      txDeltaClp: 0,
      txCount: 0,
      resolvedBalanceClp: fallback,
      anchorSource: null,
      needsOpening: true,
      cutoffYmd,
    };
  }

  const txAgg = await prisma.financeBankTransaction.aggregate({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: { gt: opening.asOfDate, lte: cutoff },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const txDeltaClp = Number(txAgg._sum.amount ?? 0);

  return {
    anchorSnapshotDate: opening.asOfDate,
    anchorBalanceClp: opening.balance,
    txDeltaClp,
    txCount: txAgg._count._all,
    resolvedBalanceClp: opening.balance + txDeltaClp,
    anchorSource: "OPENING",
    needsOpening: false,
    cutoffYmd,
  };
}

/**
 * Recalcula y persiste el cache `currentBalance` desde el ledger a hoy.
 * Idempotente. Sin OPENING no toca el cache (no hay ledger que persistir).
 */
export async function syncCurrentBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOf?: Date | string,
): Promise<ResolvedAccountBalance> {
  const resolved = await resolveAccountBalanceFromMovements(
    tenantId,
    bankAccountId,
    asOf,
  );

  if (!resolved.needsOpening) {
    await prisma.financeBankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: new Decimal(resolved.resolvedBalanceClp),
        balanceUpdatedAt: new Date(),
      },
    });
  }

  return resolved;
}

/**
 * Saldo consolidado del ledger (cuentas CLP activas) a una fecha. Reemplaza
 * los helpers que tomaban "el snapshot más reciente" sin sumar movimientos.
 */
export async function resolveTenantBankLedgerAsOf(
  tenantId: string,
  asOf?: Date | string,
): Promise<number> {
  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: { id: true },
  });
  let total = 0;
  for (const acc of accounts) {
    const r = await resolveAccountBalanceFromMovements(tenantId, acc.id, asOf);
    total += r.resolvedBalanceClp;
  }
  return total;
}

// ── Saldo inicial ─────────────────────────────────────────────────────────

export interface SetOpeningBalanceInput {
  bankAccountId: string;
  /** Día YA CERRADO cuyo saldo de cierre se toma como inicio del ledger. */
  asOfDate: string;
  balance: number;
  note?: string | null;
}

/**
 * Define (o redefine) el saldo inicial del ledger. Cada cambio es una fila
 * nueva (historial completo); el activo es el más reciente. Debe ser un día
 * ya terminado en Chile: un saldo intradía dejaría fuera los movimientos
 * posteriores de ese mismo día.
 */
export async function setOpeningBalance(
  tenantId: string,
  userId: string | null,
  input: SetOpeningBalanceInput,
) {
  if (!YMD_RE.test(input.asOfDate)) {
    throw new Error("asOfDate debe ser YYYY-MM-DD");
  }
  if (input.asOfDate >= todayInChile()) {
    throw new Error(
      "El saldo inicial debe ser el saldo de cierre de un día ya terminado (ayer o anterior)",
    );
  }
  if (!Number.isFinite(input.balance)) {
    throw new Error("Saldo inválido");
  }
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: input.bankAccountId, tenantId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  let created: Awaited<ReturnType<typeof prisma.financeBankAccountBalance.create>>;
  try {
    created = await prisma.financeBankAccountBalance.create({
      data: {
        tenantId,
        bankAccountId: input.bankAccountId,
        asOfDate: utcDateFromYmd(input.asOfDate),
        balance: new Decimal(input.balance),
        source: "OPENING",
        note: input.note?.trim() || null,
        createdById: userId ?? null,
      },
    });
  } catch (err) {
    if (isOpeningEnumMissingError(err)) {
      warnLedgerMigrationPending();
      throw new Error(LEDGER_MIGRATION_PENDING_MESSAGE);
    }
    throw err;
  }

  const resolved = await syncCurrentBalanceFromMovements(
    tenantId,
    input.bankAccountId,
  );

  return { opening: created, resolved };
}

// ── Lecturas del banco y cuadratura ───────────────────────────────────────

export interface BalanceDiscrepancy {
  reported: number;
  computed: number;
  delta: number;
  exceeds: boolean;
  thresholdClp: number;
  asOfDate: string;
  /** False si la cuenta no tiene saldo inicial: `computed` es un fallback. */
  evaluable: boolean;
}

export interface LastUnexplainedDiscrepancy {
  asOfDate: string;
  deltaClp: number;
  reported: number;
  computed: number | null;
}

/**
 * `asOf` con hora → fecha calendario Chile. YYYY-MM-DD se usa tal cual
 * (no se parsea como Date UTC, que caería al día anterior en Santiago).
 */
export function parseAsOfToChileYmd(asOf: string): string {
  const trimmed = asOf.trim();
  if (YMD_RE.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error("asOf inválido");
  }
  return ymdInChile(d);
}

export function evaluateBalanceDiscrepancy(args: {
  reported: number;
  computed: number;
  thresholdClp: number;
  asOfDate: string;
  evaluable?: boolean;
}): BalanceDiscrepancy {
  const reported = new Decimal(args.reported);
  const computed = new Decimal(args.computed);
  const delta = reported.minus(computed);
  const threshold = new Decimal(args.thresholdClp);
  const evaluable = args.evaluable ?? true;
  return {
    reported: reported.toNumber(),
    computed: computed.toNumber(),
    delta: delta.toNumber(),
    exceeds: evaluable && delta.abs().gte(threshold),
    thresholdClp: args.thresholdClp,
    asOfDate: args.asOfDate,
    evaluable,
  };
}

export async function getBankBalanceDiscrepancyThresholdClp(
  tenantId: string,
): Promise<number> {
  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { bankBalanceDiscrepancyThresholdClp: true },
  });
  const n = config?.bankBalanceDiscrepancyThresholdClp;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP;
}

export async function resolveAndEvaluateBalanceDiscrepancy(args: {
  tenantId: string;
  bankAccountId: string;
  asOf: string;
  reportedBalance: number;
  thresholdClp?: number;
}): Promise<BalanceDiscrepancy> {
  const asOfDate = parseAsOfToChileYmd(args.asOf);
  const thresholdClp =
    args.thresholdClp ??
    (await getBankBalanceDiscrepancyThresholdClp(args.tenantId));
  const resolved = await resolveAccountBalanceFromMovements(
    args.tenantId,
    args.bankAccountId,
    asOfDate,
  );
  return evaluateBalanceDiscrepancy({
    reported: args.reportedBalance,
    computed: resolved.resolvedBalanceClp,
    thresholdClp,
    asOfDate,
    evaluable: !resolved.needsOpening,
  });
}

export type RegisterBankReadingResult =
  | {
      ok: true;
      snapshot: { id: string; asOfDate: Date; balance: Decimal; source: FinanceBalanceSource; note: string | null; createdAt: Date; createdById: string | null; computedBalance: Decimal | null; deltaClp: Decimal | null };
      discrepancy: BalanceDiscrepancy;
      /** Saldo del ledger a hoy (no cambia por la lectura). */
      resolvedBalanceClp: number;
      needsOpening: boolean;
      /** True si esta lectura IMPORT inicializó el ledger (cuenta sin OPENING). */
      bootstrappedOpening: boolean;
    }
  | {
      ok: false;
      error: "note_required";
      discrepancy: BalanceDiscrepancy;
    };

/**
 * Registra una lectura del banco y la cuadra contra el ledger a esa fecha.
 * NUNCA modifica el saldo. Excepción de arranque: una lectura `IMPORT`
 * (cierre de cartola, saldo de fin de día) en una cuenta sin saldo inicial
 * crea el OPENING a esa fecha, porque es la única lectura que garantiza
 * incluir el día completo.
 */
export async function registerBankReading(args: {
  tenantId: string;
  userId: string | null;
  bankAccountId: string;
  asOf: string;
  balance: number;
  source: BankReadingSource;
  note?: string | null;
  requireNoteIfExceeds?: boolean;
}): Promise<RegisterBankReadingResult> {
  const asOfDate = parseAsOfToChileYmd(args.asOf);
  const discrepancy = await resolveAndEvaluateBalanceDiscrepancy({
    tenantId: args.tenantId,
    bankAccountId: args.bankAccountId,
    asOf: asOfDate,
    reportedBalance: args.balance,
  });

  if (
    args.requireNoteIfExceeds &&
    discrepancy.exceeds &&
    !args.note?.trim()
  ) {
    return { ok: false, error: "note_required", discrepancy };
  }

  const account = await prisma.financeBankAccount.findFirst({
    where: { id: args.bankAccountId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  let bootstrappedOpening = false;
  if (
    !discrepancy.evaluable &&
    args.source === "IMPORT" &&
    asOfDate < todayInChile()
  ) {
    try {
      await setOpeningBalance(args.tenantId, args.userId, {
        bankAccountId: args.bankAccountId,
        asOfDate,
        balance: args.balance,
        note: "Saldo inicial tomado del cierre de la primera cartola importada.",
      });
      bootstrappedOpening = true;
    } catch (err) {
      // Sin migración aplicada no se puede crear el OPENING: la lectura se
      // registra igual y la cuenta sigue "sin saldo inicial".
      if (!(err instanceof Error && err.message === LEDGER_MIGRATION_PENDING_MESSAGE)) {
        throw err;
      }
    }
  }

  const noteParts: string[] = [];
  if (args.note?.trim()) noteParts.push(args.note.trim());
  if (!discrepancy.evaluable && !bootstrappedOpening) {
    noteParts.push("Sin saldo inicial definido: lectura registrada sin cuadratura.");
  }

  const snapshot = await prisma.financeBankAccountBalance.create({
    data: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      asOfDate: utcDateFromYmd(asOfDate),
      balance: new Decimal(args.balance),
      source: args.source,
      note: noteParts.length > 0 ? noteParts.join(" ") : null,
      createdById: args.userId ?? null,
      computedBalance: discrepancy.evaluable
        ? new Decimal(discrepancy.computed)
        : bootstrappedOpening
          ? new Decimal(args.balance)
          : null,
      deltaClp: discrepancy.evaluable
        ? new Decimal(discrepancy.delta)
        : bootstrappedOpening
          ? new Decimal(0)
          : null,
    },
  });

  const resolved = await syncCurrentBalanceFromMovements(
    args.tenantId,
    args.bankAccountId,
  );

  return {
    ok: true,
    snapshot,
    discrepancy: bootstrappedOpening
      ? { ...discrepancy, computed: args.balance, delta: 0, exceeds: false, evaluable: true }
      : discrepancy,
    resolvedBalanceClp: resolved.resolvedBalanceClp,
    needsOpening: resolved.needsOpening,
    bootstrappedOpening,
  };
}

export async function findLatestUnexplainedDiscrepancy(
  tenantId: string,
  bankAccountId: string,
  now: Date = new Date(),
): Promise<LastUnexplainedDiscrepancy | null> {
  const since = utcDateFromYmd(ymdInChile(addDaysChile(now, -90)));
  const rows = await prisma.financeBankAccountBalance.findMany({
    where: {
      tenantId,
      bankAccountId,
      source: { in: BANK_READING_SOURCES },
      deltaClp: { not: null },
      asOfDate: { gte: since },
    },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: {
      asOfDate: true,
      deltaClp: true,
      balance: true,
      computedBalance: true,
    },
  });
  const hit = rows.find(
    (r) => r.deltaClp != null && !new Decimal(r.deltaClp.toString()).isZero(),
  );
  if (!hit || hit.deltaClp == null) return null;
  return {
    asOfDate: hit.asOfDate.toISOString().slice(0, 10),
    deltaClp: Number(hit.deltaClp),
    reported: Number(hit.balance),
    computed: hit.computedBalance != null ? Number(hit.computedBalance) : null,
  };
}

/**
 * Lista el historial completo de saldos de una cuenta (saldo inicial y
 * lecturas), más recientes primero.
 */
export async function listBalanceHistory(
  tenantId: string,
  bankAccountId: string
) {
  return prisma.financeBankAccountBalance.findMany({
    where: { tenantId, bankAccountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Elimina un snapshot (lectura o saldo inicial) y resincroniza el cache.
 * Si era el OPENING activo, el ledger pasa al OPENING anterior o queda sin
 * saldo inicial.
 */
export async function deleteBalanceSnapshot(
  tenantId: string,
  bankAccountId: string,
  snapshotId: string
) {
  const snap = await prisma.financeBankAccountBalance.findFirst({
    where: { id: snapshotId, tenantId, bankAccountId },
  });
  if (!snap) {
    throw new Error("Snapshot no encontrado");
  }

  await prisma.financeBankAccountBalance.delete({ where: { id: snapshotId } });

  await syncCurrentBalanceFromMovements(tenantId, bankAccountId);
}

// ── Reporte de cuadratura ─────────────────────────────────────────────────

export interface LedgerReading {
  id: string;
  asOfDate: string;
  source: FinanceBalanceSource;
  balance: number;
  /** Ledger a esa fecha (null si la fecha es anterior al saldo inicial o no hay OPENING). */
  ledgerAtDate: number | null;
  deltaClp: number | null;
  note: string | null;
  createdAt: string;
}

export interface LedgerDayDelta {
  asOfDate: string;
  source: FinanceBalanceSource;
  readingBalance: number;
  ledgerAtDate: number;
  deltaClp: number;
}

export interface DuplicateSuspect {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  dupSuspectOfId: string | null;
}

export interface ContentGroup {
  key: string;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
  /** True si todas las filas traen el mismo saldo del banco: copia casi segura. */
  sameBalance: boolean;
  txIds: string[];
}

export interface ReconciliationReport {
  opening: { id: string; asOfDate: string; balance: number } | null;
  needsOpening: boolean;
  ledgerTodayClp: number;
  latestReading: LedgerReading | null;
  /** Lecturas de la ventana, más recientes primero. */
  readings: LedgerReading[];
  /** Un item por fecha con lectura cuyo delta vivo ≠ 0 (última lectura del día). */
  daysWithDelta: LedgerDayDelta[];
  duplicateSuspects: DuplicateSuspect[];
  contentGroups: ContentGroup[];
  windowFromYmd: string;
  windowToYmd: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Cuadratura de una cuenta: recalcula en vivo el ledger a la fecha de cada
 * lectura (no usa el delta guardado, que puede haber quedado obsoleto tras
 * importar o ocultar movimientos) y reúne las pistas para explicar un delta:
 * posibles duplicados pendientes y grupos de filas con la misma huella.
 */
export async function buildReconciliationReport(
  tenantId: string,
  bankAccountId: string,
  opts?: { days?: number; asOf?: Date | string },
): Promise<ReconciliationReport> {
  const days = opts?.days ?? 90;
  const todayYmd = ledgerCutoffYmd(opts?.asOf);
  const today = utcDateFromYmd(todayYmd);
  const windowFromYmd = ymdInChile(addDaysChile(today, -days));
  const windowFrom = utcDateFromYmd(windowFromYmd);

  const [opening, ledgerToday, readingRows] = await Promise.all([
    getLedgerOpening(tenantId, bankAccountId),
    resolveAccountBalanceFromMovements(tenantId, bankAccountId, todayYmd),
    prisma.financeBankAccountBalance.findMany({
      where: {
        tenantId,
        bankAccountId,
        source: { in: BANK_READING_SOURCES },
        asOfDate: { gte: windowFrom, lte: today },
      },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        asOfDate: true,
        source: true,
        balance: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  // Movimientos visibles de la ventana (para ledger por día y duplicados).
  const windowTx = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: { gte: windowFrom, lte: today },
    },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
      balance: true,
      dupSuspectOfId: true,
      dupResolvedAt: true,
    },
  });

  // base = ledger al cierre del día anterior al inicio de la ventana.
  let ledgerAtDate: (d: Date) => number | null = () => null;
  if (opening) {
    const openingYmd = ymd(opening.asOfDate);
    let base = opening.balance;
    if (openingYmd < windowFromYmd) {
      const before = await prisma.financeBankTransaction.aggregate({
        where: {
          tenantId,
          bankAccountId,
          hiddenAt: null,
          transactionDate: { gt: opening.asOfDate, lt: windowFrom },
        },
        _sum: { amount: true },
      });
      base += Number(before._sum.amount ?? 0);
    }
    const byDay = new Map<string, number>();
    for (const t of windowTx) {
      const k = ymd(t.transactionDate);
      byDay.set(k, (byDay.get(k) ?? 0) + Number(t.amount));
    }
    const dayKeys = [...byDay.keys()].sort();
    ledgerAtDate = (d: Date) => {
      const target = ymd(d);
      if (target < openingYmd) return null;
      if (target === openingYmd) return opening.balance;
      // Movimientos del día del OPENING ya están en el saldo inicial.
      const startYmd = openingYmd >= windowFromYmd ? openingYmd : windowFromYmd;
      let sum = base;
      for (const k of dayKeys) {
        if (k > target) break;
        if (k <= startYmd && openingYmd >= windowFromYmd) continue;
        sum += byDay.get(k) ?? 0;
      }
      return sum;
    };
  }

  const readings: LedgerReading[] = readingRows.map((r) => {
    const l = ledgerAtDate(r.asOfDate);
    const balance = Number(r.balance);
    return {
      id: r.id,
      asOfDate: ymd(r.asOfDate),
      source: r.source,
      balance,
      ledgerAtDate: l,
      deltaClp: l == null ? null : Math.round((balance - l) * 100) / 100,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const daysWithDelta: LedgerDayDelta[] = [];
  const seenDays = new Set<string>();
  for (const r of readings) {
    if (seenDays.has(r.asOfDate)) continue;
    seenDays.add(r.asOfDate);
    if (r.ledgerAtDate == null || r.deltaClp == null) continue;
    if (Math.abs(r.deltaClp) < 1) continue;
    daysWithDelta.push({
      asOfDate: r.asOfDate,
      source: r.source,
      readingBalance: r.balance,
      ledgerAtDate: r.ledgerAtDate,
      deltaClp: r.deltaClp,
    });
  }

  const duplicateSuspects: DuplicateSuspect[] = windowTx
    .filter((t) => t.dupSuspectOfId != null && t.dupResolvedAt == null)
    .map((t) => ({
      id: t.id,
      transactionDate: ymd(t.transactionDate),
      description: t.description,
      reference: t.reference,
      amount: Number(t.amount),
      balance: t.balance != null ? Number(t.balance) : null,
      dupSuspectOfId: t.dupSuspectOfId,
    }));

  const groups = new Map<string, typeof windowTx>();
  for (const t of windowTx) {
    const key = bankTxContentKey({
      transactionDate: t.transactionDate,
      amount: t.amount,
      description: t.description,
      reference: t.reference,
    });
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const contentGroups: ContentGroup[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const first = rows[0]!;
    const balances = rows.map((r) => (r.balance != null ? Number(r.balance) : null));
    const sameBalance =
      balances.every((b) => b != null) &&
      balances.every((b) => b === balances[0]);
    contentGroups.push({
      key,
      transactionDate: ymd(first.transactionDate),
      amount: Number(first.amount),
      description: first.description,
      reference: first.reference,
      sameBalance,
      txIds: rows.map((r) => r.id),
    });
  }
  contentGroups.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

  return {
    opening: opening
      ? { id: opening.id, asOfDate: ymd(opening.asOfDate), balance: opening.balance }
      : null,
    needsOpening: !opening,
    ledgerTodayClp: ledgerToday.resolvedBalanceClp,
    latestReading: readings[0] ?? null,
    readings,
    daysWithDelta,
    duplicateSuspects,
    contentGroups,
    windowFromYmd,
    windowToYmd: todayYmd,
  };
}
