/**
 * Bank Account Balance History Service
 *
 * Maneja los snapshots históricos de saldo de una cuenta bancaria. Permite:
 *   - Fijar manualmente el saldo a una fecha (auditado por usuario y nota).
 *   - Listar el historial completo de saldos de una cuenta.
 *   - Resolver el saldo "más cercano hacia atrás" para una fecha dada.
 *
 * Cuando se fija un saldo manual, además se actualiza `currentBalance` y
 * `balanceUpdatedAt` en `FinanceBankAccount` SI la fecha del snapshot es
 * la más reciente registrada — esto mantiene la pestaña "Cuentas" coherente
 * con el último saldo conocido.
 *
 * Precedencia de ancla: en la misma fecha, MANUAL gana sobre IMPORT/CALCULATED
 * para que una cartola del mismo día no pise un saldo fijado a mano.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBalanceSource } from "@prisma/client";
import { bankTxDateFilterAfterAnchor } from "@/modules/finance/banking/bank-tx-after-anchor";
import { utcDateFromYmd, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP } from "@/modules/finance/banking/bank-balance-constants";

export interface ResolvedAccountBalance {
  anchorSnapshotDate: Date | null;
  anchorBalanceClp: number;
  txDeltaClp: number;
  txCount: number;
  resolvedBalanceClp: number;
  /** Origen del snapshot ancla (si hay). */
  anchorSource?: FinanceBalanceSource | null;
}

export interface BalanceAnchorCandidate {
  balance: unknown;
  asOfDate: Date;
  source: FinanceBalanceSource;
  createdAt: Date;
}

/**
 * Elige el ancla entre candidatos ya filtrados (asOfDate ≤ hoy), ordenados
 * por asOfDate desc / createdAt desc. En empate de fecha, MANUAL gana.
 */
export function pickBalanceAnchor(
  candidates: BalanceAnchorCandidate[],
): BalanceAnchorCandidate | null {
  if (candidates.length === 0) return null;
  const maxTime = candidates[0]!.asOfDate.getTime();
  const sameDate = candidates.filter((c) => c.asOfDate.getTime() === maxTime);
  const manual = sameDate.find((c) => c.source === "MANUAL");
  return manual ?? sameDate[0] ?? null;
}

/**
 * True si conviene crear un snapshot IMPORT de cierre de cartola.
 * False cuando ya hay un MANUAL con fecha ≥ cierre (protege el saldo fijado).
 */
export function shouldApplyImportClosingBalance(args: {
  importAsOfDate: Date;
  protectingManualAsOfDate: Date | null;
}): boolean {
  if (!args.protectingManualAsOfDate) return true;
  return args.protectingManualAsOfDate.getTime() < args.importAsOfDate.getTime();
}

function toLocalDateOnly(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Resuelve el saldo de una cuenta a una fecha: snapshot más reciente ≤ fecha
 * + Σ movimientos visibles de cartola (hiddenAt IS NULL).
 *
 * Cualquier ancla (IMPORT / MANUAL / CALCULATED): transactionDate > asOfDate
 * (el saldo anclado ya trae el día). MATCHED / DTE borrador no filtran: la
 * plata del banco no depende de a qué documento se concilió.
 *
 * Sin snapshot, devuelve `currentBalance` (no se puede derivar solo desde
 * movimientos).
 */
export async function resolveAccountBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOfDate?: Date,
): Promise<ResolvedAccountBalance> {
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { currentBalance: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const todayDate = toLocalDateOnly(asOfDate ?? new Date());

  const candidates = await prisma.financeBankAccountBalance.findMany({
    where: {
      tenantId,
      bankAccountId,
      asOfDate: { lte: todayDate },
    },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: { balance: true, asOfDate: true, source: true, createdAt: true },
  });

  const anchor = pickBalanceAnchor(candidates);

  if (!anchor) {
    const fallback = Number(account.currentBalance ?? 0);
    return {
      anchorSnapshotDate: null,
      anchorBalanceClp: fallback,
      txDeltaClp: 0,
      txCount: 0,
      resolvedBalanceClp: fallback,
      anchorSource: null,
    };
  }

  const txAgg = await prisma.financeBankTransaction.aggregate({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: bankTxDateFilterAfterAnchor(
        anchor.asOfDate,
        todayDate,
        anchor.source,
      ),
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const anchorBalanceClp = Number(anchor.balance);
  const txDeltaClp = Number(txAgg._sum.amount ?? 0);

  return {
    anchorSnapshotDate: anchor.asOfDate,
    anchorBalanceClp,
    txDeltaClp,
    txCount: txAgg._count._all,
    resolvedBalanceClp: anchorBalanceClp + txDeltaClp,
    anchorSource: anchor.source,
  };
}

/**
 * Recalcula y persiste `currentBalance` desde snapshot + movimientos.
 * Idempotente: conviene llamarlo tras cada import o cambio de movimientos.
 */
export async function syncCurrentBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOfDate?: Date,
): Promise<ResolvedAccountBalance> {
  const resolved = await resolveAccountBalanceFromMovements(
    tenantId,
    bankAccountId,
    asOfDate,
  );

  if (resolved.anchorSnapshotDate != null) {
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

export interface SetBalanceSnapshotInput {
  bankAccountId: string;
  asOfDate: string; // YYYY-MM-DD
  balance: number;
  source?: FinanceBalanceSource;
  note?: string | null;
  computedBalance?: number | null;
  deltaClp?: number | null;
}

export interface BalanceDiscrepancy {
  reported: number;
  computed: number;
  delta: number;
  exceeds: boolean;
  thresholdClp: number;
  asOfDate: string;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
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
}): BalanceDiscrepancy {
  const reported = new Decimal(args.reported);
  const computed = new Decimal(args.computed);
  const delta = reported.minus(computed);
  const threshold = new Decimal(args.thresholdClp);
  return {
    reported: reported.toNumber(),
    computed: computed.toNumber(),
    delta: delta.toNumber(),
    exceeds: delta.abs().gte(threshold),
    thresholdClp: args.thresholdClp,
    asOfDate: args.asOfDate,
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
    utcDateFromYmd(asOfDate),
  );
  return evaluateBalanceDiscrepancy({
    reported: args.reportedBalance,
    computed: resolved.resolvedBalanceClp,
    thresholdClp,
    asOfDate,
  });
}

export type ApplyReportedBalanceResult =
  | {
      ok: true;
      snapshot: Awaited<ReturnType<typeof setBalanceSnapshot>>;
      discrepancy: BalanceDiscrepancy;
      appliedAsAnchor: boolean;
      resolvedBalanceClp: number;
    }
  | {
      ok: false;
      error: "note_required";
      discrepancy: BalanceDiscrepancy;
    };

/**
 * Evalúa reportado vs calculado, persiste snapshot con delta y sincroniza
 * currentBalance. Un MANUAL más nuevo no se pisa como ancla, pero el
 * snapshot queda en el historial (discrepancia informativa).
 */
export async function applyReportedBalance(args: {
  tenantId: string;
  userId: string | null;
  bankAccountId: string;
  asOf: string;
  balance: number;
  source: FinanceBalanceSource;
  note?: string | null;
  requireNoteIfExceeds?: boolean;
}): Promise<ApplyReportedBalanceResult> {
  const asOfDate = parseAsOfToChileYmd(args.asOf);
  const asOfDateUtc = utcDateFromYmd(asOfDate);
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

  let appliedAsAnchor = true;
  if (args.source !== "MANUAL") {
    const protectingManual = await prisma.financeBankAccountBalance.findFirst({
      where: {
        tenantId: args.tenantId,
        bankAccountId: args.bankAccountId,
        source: "MANUAL",
        asOfDate: { gte: asOfDateUtc },
      },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { asOfDate: true },
    });
    appliedAsAnchor = shouldApplyImportClosingBalance({
      importAsOfDate: asOfDateUtc,
      protectingManualAsOfDate: protectingManual?.asOfDate ?? null,
    });
  }

  const noteParts: string[] = [];
  if (args.note?.trim()) noteParts.push(args.note.trim());
  if (!appliedAsAnchor) {
    noteParts.push("No usado como ancla: hay un saldo MANUAL más reciente.");
  }

  const snapshot = await setBalanceSnapshot(args.tenantId, args.userId, {
    bankAccountId: args.bankAccountId,
    asOfDate,
    balance: args.balance,
    source: args.source,
    note: noteParts.length > 0 ? noteParts.join(" ") : null,
    computedBalance: discrepancy.computed,
    deltaClp: discrepancy.delta,
  });

  const resolved = await syncCurrentBalanceFromMovements(
    args.tenantId,
    args.bankAccountId,
  );

  return {
    ok: true,
    snapshot,
    discrepancy,
    appliedAsAnchor,
    resolvedBalanceClp: resolved.resolvedBalanceClp,
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
 * Crea un snapshot de saldo para una cuenta a una fecha. Si esta fecha
 * resulta ser la ancla efectiva (tras precedencia MANUAL), actualiza
 * `currentBalance`. Devuelve el snapshot creado.
 */
export async function setBalanceSnapshot(
  tenantId: string,
  userId: string | null,
  input: SetBalanceSnapshotInput
) {
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: input.bankAccountId, tenantId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const created = await prisma.financeBankAccountBalance.create({
    data: {
      tenantId,
      bankAccountId: input.bankAccountId,
      asOfDate: utcDateFromYmd(input.asOfDate),
      balance: new Decimal(input.balance),
      source: input.source ?? "MANUAL",
      note: input.note ?? null,
      createdById: userId ?? null,
      computedBalance:
        input.computedBalance != null
          ? new Decimal(input.computedBalance)
          : null,
      deltaClp: input.deltaClp != null ? new Decimal(input.deltaClp) : null,
    },
  });

  // Alinear currentBalance con la ancla efectiva (MANUAL gana en empate).
  await syncCurrentBalanceFromMovements(tenantId, input.bankAccountId);

  return created;
}

/**
 * Lista el historial completo de snapshots de saldo de una cuenta,
 * más recientes primero.
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
 * Elimina un snapshot. Si el eliminado era el más reciente, recalcula
 * `currentBalance` desde el siguiente más reciente (o lo deja en null
 * si era el único).
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
