/**
 * Bank Transaction Link Service
 *
 * Vínculos polymorphic entre un movimiento bancario y entidades (DTE, gasto
 * manual, lote, etc). Soporta split N:N con cuenta contable de "resto".
 *
 * Flujo:
 *   1. Cliente abre el drawer en una tx UNMATCHED.
 *   2. Llama a `findCandidates` para sugerencias por monto/fecha similares.
 *   3. Llama a `setTransactionLinks` con la lista final de vínculos. El
 *      service:
 *        - Borra links previos de esa tx.
 *        - Crea los nuevos.
 *        - Si la suma de links cubre el monto del movimiento, marca
 *          reconciliationStatus = MATCHED. Si queda resto sin asignar,
 *          UNMATCHED. Si hay overflow (suma > monto), error.
 *   4. Para "categorizar manual" sin entidad, se usa targetType=EXPENSE/INCOME
 *      y se especifica accountPlanId + amount.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  FinanceLinkTarget,
  FinanceSiiStatus,
  Prisma,
} from "@prisma/client";
import { createManualEntry } from "../accounting/journal-entry.service";
import { normalizeRutForMatch } from "./auto-match-payment.service";
import { extractCanonicalRutFromBankText } from "./rut-recognition.service";
import {
  evaluateWriteOff,
  applyAutoWriteOff,
  resolveCounterpartyAccountId,
} from "./write-off.service";
import {
  deriveDtePaymentStatusFromAllocations,
  isManualPaidWithoutReconciliation,
} from "../billing/dte-payment-status";
import type { CostCenterAssignment } from "./cost-allocation-math";
import { replaceLinkAllocations, loadAllocationsForLinks } from "./cost-allocation.service";
import type { EnrichedAllocation } from "./cost-allocation.service";
import {
  dteIneligibleReconcileReason,
  isDteEligibleForBankReconcile,
  sortDteCandidatesByAmountMatch,
} from "./dte-reconcile-match";
import { healBankTxLinkFromCashflowOccurrence } from "./occurrence-link-heal.service";

// ── Helpers internos ──

/**
 * Filtros comunes de DTE elegible para conciliación bancaria.
 * - Excluye NC (61) / ND (56): no son documentos cobrables.
 * - Excluye facturas anuladas por NC total (`voidedByCreditNoteId`) o
 *   rechazadas/anuladas en SII: no deben ofrecerse como candidatos.
 * - Excluye borradores (`siiStatus=DRAFT` o folio 0): nunca se concilian;
 *   hay que emitir la factura primero.
 * Las NC parciales (creditedNetAmount > 0, voidedByCreditNoteId null)
 * SÍ permanecen — el saldo pendiente ya refleja el ajuste.
 */
const RECONCILE_ELIGIBLE_DTE: Prisma.FinanceDteWhereInput = {
  dteType: { notIn: [56, 61] },
  voidedByCreditNoteId: null,
  folio: { gt: 0 },
  siiStatus: {
    notIn: ["ANNULLED", "REJECTED", "DRAFT"] as FinanceSiiStatus[],
  },
};

/**
 * Calcula el siguiente código secuencial para un FinancePaymentRecord.
 * Mantiene el patrón histórico de createPaymentRecord (PAG-NNNNNN para
 * desembolsos, COB-NNNNNN para cobros) sin acoplarlo a esa función para
 * poder generar el code dentro de la misma transacción Prisma.
 */
async function nextPaymentRecordCode(
  txClient: Prisma.TransactionClient,
  tenantId: string,
  isIncome: boolean
): Promise<string> {
  const count = await txClient.financePaymentRecord.count({
    where: { tenantId },
  });
  const prefix = isIncome ? "COB" : "PAG";
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Recalcula `amountPaid`, `amountPending` y `paymentStatus` de un DTE a
 * partir de TODAS sus allocations vivas (no del delta). Esto es robusto
 * contra reentradas y desconciliaciones parciales: la fuente de verdad
 * son las filas de FinancePaymentAllocation que apuntan al DTE.
 */
async function recomputeDtePaymentAggregate(
  txClient: Prisma.TransactionClient,
  dteId: string,
  opts?: {
    /** Tenant del DTE — si se pasa, intenta write-off automático. */
    tenantId?: string;
    /** Fecha del pago disparador (para period lookup del journal entry). */
    paymentDate?: Date;
    /** Cuenta contable del banco que recibió/emitió el pago (para OVER). */
    bankAccountPlanId?: string | null;
    /** Usuario que disparó la conciliación. */
    userId?: string | null;
  }
): Promise<void> {
  const dte = await txClient.financeDte.findUnique({
    where: { id: dteId },
    select: {
      totalAmount: true,
      dueDate: true,
      paymentStatus: true,
      amountPaid: true,
      reconciledAt: true,
    },
  });
  if (!dte) return;
  const agg = await txClient.financePaymentAllocation.aggregate({
    where: { dteId },
    _sum: { amount: true },
  });
  const total = dte.totalAmount.toNumber();
  const paid = agg._sum.amount ? agg._sum.amount.toNumber() : 0;

  // Invariante "pago manual sin conciliación": bulk-mark-paid marca el DTE
  // como PAID sin crear allocations (no hay movimiento bancario aún). Si al
  // recompute las allocations están vacías y el DTE ya estaba PAID con
  // amountPaid==total y reconciledAt==null, ese estado representa el pago
  // manual y NO debe revertirse a UNPAID. Solo seguimos al cálculo derivado
  // cuando hay allocations vivas o cuando hay reconciliación bancaria.
  if (
    isManualPaidWithoutReconciliation({
      allocatedPaid: paid,
      paymentStatus: dte.paymentStatus,
      reconciledAt: dte.reconciledAt,
      amountPaid: dte.amountPaid.toNumber(),
      totalAmount: total,
    })
  ) {
    return;
  }

  let status = deriveDtePaymentStatusFromAllocations({
    totalAmount: total,
    allocatedPaid: paid,
    dueDate: dte.dueDate,
    currentPaymentStatus: dte.paymentStatus,
  });
  let writeOffApplied = false;

  if (status === "PARTIAL") {

    // El pago no cubre el total con la tolerancia mínima. Antes de marcar
    // PARTIAL, intentar write-off automático: si la diferencia cae dentro
    // del umbral configurado por el tenant, cerrar el DTE como PAID y
    // crear un asiento contable de ajuste.
    if (opts?.tenantId && opts.paymentDate) {
      const config = await txClient.financeCashflowConfig.findUnique({
        where: { tenantId: opts.tenantId },
        select: {
          writeOffAutoEnabled: true,
          writeOffMaxAmountClp: true,
          writeOffMaxPercent: true,
          writeOffShortPaymentAccountId: true,
          writeOffOverPaymentAccountId: true,
        },
      });

      if (config) {
        const decision = evaluateWriteOff(total, paid, config);
        if (decision.shouldApply && decision.accountId && decision.direction) {
          const dteFull = await txClient.financeDte.findUnique({
            where: { id: dteId },
            select: {
              folio: true,
              direction: true,
              supplierId: true,
              receiverName: true,
              issuerName: true,
            },
          });

          const counterpartyAccountId = dteFull
            ? await resolveCounterpartyAccountId(txClient, opts.tenantId, {
                direction: dteFull.direction === "ISSUED" ? "ISSUED" : "RECEIVED",
                supplierId: dteFull.supplierId,
              })
            : null;
          const counterpartyName =
            dteFull?.direction === "ISSUED"
              ? (dteFull.receiverName ?? "Cliente")
              : (dteFull?.issuerName ?? "Proveedor");

          try {
            await applyAutoWriteOff(txClient, {
              tenantId: opts.tenantId,
              dteId,
              dteFolio: dteFull?.folio ?? null,
              dteCustomerName: counterpartyName,
              variance: total - paid,
              direction: decision.direction,
              adjustmentAccountId: decision.accountId,
              counterpartyAccountId,
              bankAccountPlanId: opts.bankAccountPlanId ?? null,
              paymentDate: opts.paymentDate,
              createdBy: opts.userId ?? "system",
            });
            status = "PAID";
            writeOffApplied = true;
          } catch (err) {
            console.error(
              `[write-off] No se pudo aplicar write-off automático al DTE ${dteId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }
  }

  // Si se aplicó write-off, el `amountPaid` del DTE se completa al total
  // (el saldo se cerró contablemente). Si no, se queda con `paid` real.
  const finalAmountPaid = writeOffApplied ? total : paid;
  const finalAmountPending = Math.max(0, total - finalAmountPaid);

  await txClient.financeDte.update({
    where: { id: dteId },
    data: {
      amountPaid: new Decimal(finalAmountPaid),
      amountPending: new Decimal(finalAmountPending),
      paymentStatus: status,
    },
  });
}

// ── Tipos ──

/** Tipos de link que representan clasificación a fila de flujo (sin DTE/factoring). */
const FLOW_ROW_CLASSIFY_TARGET_TYPES: ReadonlySet<FinanceLinkTarget> = new Set([
  "EXPENSE",
  "INCOME",
]);

/**
 * ¿Se puede (re)clasificar a fila de flujo sin desconciliar?
 * Verdadero si no hay links o todos son EXPENSE/INCOME puros.
 */
export function canReclassifyToFlowRow(
  links: Array<{ targetType: FinanceLinkTarget | string }>,
): boolean {
  if (links.length === 0) return true;
  return links.every((l) =>
    FLOW_ROW_CLASSIFY_TARGET_TYPES.has(l.targetType as FinanceLinkTarget),
  );
}

export interface ClassifyToFlowRowLinkInput {
  targetType: "EXPENSE" | "INCOME";
  amount: number;
  accountPlanId: string;
  flowRowId: string;
  note?: string | null;
  matchSource?: BankTxLinkInput["matchSource"];
  matchedByRuleId?: string | null;
  costCenter?: CostCenterAssignment;
}

export type ReclassifyToFlowRowResult = {
  linkIds: string[];
  mode: "created" | "updated";
};

/**
 * Clasifica o re-clasifica un movimiento a fila de flujo.
 *
 * - Sin links previos: `setTransactionLinks` (create).
 * - MATCHED con solo EXPENSE/INCOME: **update in-place** del link existente
 *   (preserva `id`, no desconcilia). Persiste `flowRowId` junto con
 *   `accountPlanId` y `note`.
 */
export async function reclassifyTransactionToFlowRow(
  tenantId: string,
  bankTxId: string,
  userId: string | null,
  input: ClassifyToFlowRowLinkInput,
): Promise<ReclassifyToFlowRowResult> {
  const existingLinks = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: bankTxId },
    select: { id: true, targetType: true, amount: true },
  });

  if (existingLinks.length > 0 && !canReclassifyToFlowRow(existingLinks)) {
    throw new Error(
      "La transacción ya tiene vínculos de conciliación; no se sobrescribe",
    );
  }

  const note = input.note ?? null;

  if (existingLinks.length === 0) {
    await setTransactionLinks(tenantId, bankTxId, userId, [
      {
        targetType: input.targetType,
        targetId: null,
        amount: input.amount,
        accountPlanId: input.accountPlanId,
        flowRowId: input.flowRowId,
        note,
        matchSource: input.matchSource ?? "MANUAL",
        matchedByRuleId: input.matchedByRuleId ?? null,
        costCenter: input.costCenter,
      },
    ]);
    const created = await prisma.financeBankTransactionLink.findMany({
      where: { tenantId, bankTransactionId: bankTxId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      linkIds: created.map((l) => l.id),
      mode: "created",
    };
  }

  const linkIds = existingLinks.map((l) => l.id);
  const bankTx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { transactionDate: true },
  });
  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    for (const link of existingLinks) {
      await tx2.financeBankTransactionLink.update({
        where: { id: link.id },
        data: {
          accountPlanId: input.accountPlanId,
          flowRowId: input.flowRowId,
          note,
          matchSource: input.matchSource ?? "MANUAL",
          matchedByRuleId: input.matchedByRuleId ?? null,
        },
      });
      if (input.costCenter !== undefined) {
        await replaceLinkAllocations(tx2, {
          tenantId,
          linkId: link.id,
          linkAmount: Number(link.amount),
          assignment: input.costCenter,
          refDate: bankTx?.transactionDate ?? new Date(),
        });
      }
    }
    await tx2.financeBankTransaction.update({
      where: { id: bankTxId },
      data: { reconciliationStatus: "MATCHED" },
    });
  });

  if (userId) {
    const fullTx = await prisma.financeBankTransaction.findFirst({
      where: { id: bankTxId, tenantId },
      select: {
        id: true,
        bankAccountId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
      },
    });
    if (fullTx) {
      const manualLinks = existingLinks.map((l) => ({
        targetType: l.targetType as FinanceLinkTarget,
        amount: l.amount,
        accountPlanId: input.accountPlanId,
        note,
      }));
      await generateJournalEntryForLinks(
        tenantId,
        userId,
        fullTx,
        manualLinks,
      );
    }
  }

  return { linkIds, mode: "updated" };
}

export interface BankTxLinkInput {
  targetType: FinanceLinkTarget;
  targetId?: string | null;
  amount: number;
  accountPlanId?: string | null;
  /** Fila de flujo elegida (desambigua cuentas compartidas entre filas). */
  flowRowId?: string | null;
  note?: string | null;
  /** Procedencia del vínculo (RULE, DTE, MANUAL, …). */
  matchSource?:
    | "RULE"
    | "DTE"
    | "TURNO_EXTRA"
    | "PAYROLL"
    | "FINIQUITO"
    | "INFERRED"
    | "MANUAL"
    | null;
  /** Regla que originó el link (sin FK). */
  matchedByRuleId?: string | null;
  /** Destino de centro de costo. Opcional; omitir = no tocar/no crear allocations. */
  costCenter?: CostCenterAssignment;
}

export interface CandidateDte {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  documentType: string;
  /** Tipo SII (33=Factura, 34=Exenta, 39=Boleta, 56=ND, 61=NC, etc.).
   *  Usado por la UI para mostrar etiqueta corta sin parsear `documentType`. */
  dteType: number;
  folio: number;
  issuerName: string;
  receiverName: string;
  receiverRut: string | null;
  issuerRut: string | null;
  total: number;
  amountPaid: number;
  amountPending: number;
  issuedAt: string;
  paymentStatus: string;
  /** Nombre de la instalación asociada al DTE (de su creación/programación).
   *  Null si el DTE no tiene installationId o la instalación fue borrada. */
  installationName: string | null;
  /** Glosa/nota del DTE (`FinanceDte.notes`). Sirve para dar contexto en el
   *  mensaje de conciliación de Slack ("con qué se está conciliando"). */
  glosa: string | null;
}

/** Candidato de cesión a factoring (Fase 4). El monto a matchear es
 *  `simMontoAGirar` (preferido — viene del PDF de simulación) o
 *  `netAdvance` (calculado por nosotros) como fallback. */
export interface CandidateFactoring {
  id: string;
  code: string;
  factoringCompanyName: string;
  factoringCompanyId: string | null;
  fechaCesion: string;
  fechaVencimiento: string;
  invoiceAmount: number;
  /** Monto que se debería ver entrar en el banco. Preferimos sim si existe. */
  expectedDeposit: number;
  expectedDepositSource: "simulation" | "computed";
  status: string;
  dteFolio: number | null;
  dteReceiverName: string | null;
  /** Fecha de emisión del DTE cedido (ISO). Null si la op no tiene DTE. */
  dteIssuedAt: string | null;
  /** Nombre de la instalación del DTE cedido (de su creación/programación). */
  installationName: string | null;
  /** 0–100: combinación de monto, fecha, folio en glosa, catálogo factoring, banda bruta. */
  confidence: number;
  matchSignals: string[];
  isSuggested: boolean;
  /** Lote de cesión (N operaciones bajo una simulación), si aplica. */
  batchId: string | null;
  batchCode: string | null;
  batchTotalMontoAGirar: number | null;
  batchOperationsCount: number | null;
}

/** Lote de cesión ofrecido para asignar completo contra un depósito. */
export interface CandidateFactoringBatch {
  id: string;
  code: string;
  factoringCompanyName: string;
  fechaCesion: string;
  operationsCount: number;
  totalMontoAGirar: number;
  totalSource: "batch" | "sum_sim" | "sum_net";
  matchesDeposit: boolean;
  operationIds: string[];
}

/** Tolerancia de calce lote vs depósito: máx($1.000, 0,5 % del total). */
export const BATCH_DEPOSIT_MATCH_TOLERANCE = (totalAbs: number): number =>
  Math.max(1000, totalAbs * 0.005);

export type ReconcileSearchScope = "factoring" | "ceded" | "open" | "all";

const FACTORING_OP_SELECT = {
  id: true,
  code: true,
  factoringCompany: true,
  factoringCompanyId: true,
  fechaCesion: true,
  fechaVencimiento: true,
  invoiceAmount: true,
  simMontoAGirar: true,
  netAdvance: true,
  status: true,
  batchId: true,
  batch: {
    select: {
      id: true,
      code: true,
      totalMontoAGirar: true,
      operationsCount: true,
    },
  },
  dte: {
    select: {
      folio: true,
      receiverName: true,
      installationId: true,
      paymentStatus: true,
      issuerName: true,
      issuerRut: true,
      receiverRut: true,
      notes: true,
      date: true,
      dteType: true,
      voidedByCreditNoteId: true,
      siiStatus: true,
    },
  },
} as const;

type FactoringOpRow = {
  id: string;
  code: string;
  factoringCompany: string;
  factoringCompanyId: string | null;
  fechaCesion: Date | null;
  fechaVencimiento: Date | null;
  invoiceAmount: { toNumber(): number } | number;
  simMontoAGirar: { toNumber(): number } | number | null;
  netAdvance: { toNumber(): number } | number | null;
  status: string;
  batchId: string | null;
  batch: {
    id: string;
    code: string;
    totalMontoAGirar: { toNumber(): number } | number | null;
    operationsCount: number;
  } | null;
  dte: {
    folio: number | null;
    receiverName: string | null;
    installationId: string | null;
    paymentStatus?: string;
    issuerName?: string | null;
    issuerRut?: string | null;
    receiverRut?: string | null;
    notes?: string | null;
    date?: Date | null;
    dteType?: number | null;
    voidedByCreditNoteId?: string | null;
    siiStatus?: string | null;
  } | null;
};

/** True si el DTE de la cesión no es cobrable (borrador, NC/ND, anulada). */
function isIneligibleReconcileDte(
  dte: FactoringOpRow["dte"],
): boolean {
  if (!dte) return false;
  return !isDteEligibleForBankReconcile({
    siiStatus: dte.siiStatus ?? "PENDING",
    folio: dte.folio ?? 0,
    voidedByCreditNoteId: dte.voidedByCreditNoteId,
    dteType: dte.dteType,
  });
}

function throwIfDtesIneligibleForReconcile(
  dtes: Array<{
    siiStatus: string;
    folio: number;
    voidedByCreditNoteId?: string | null;
    dteType?: number | null;
  }>,
): void {
  for (const d of dtes) {
    const reason = dteIneligibleReconcileReason(d);
    if (reason) throw new Error(reason);
  }
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : v.toNumber();
}

/** Resuelve el total a girar de un lote con cadena de fallback. */
export function resolveBatchTotal(params: {
  batchTotal: number | null;
  operations: Array<{ simMontoAGirar: number | null; netAdvance: number | null }>;
}): { total: number | null; source: "batch" | "sum_sim" | "sum_net" } {
  if (params.batchTotal != null && Number.isFinite(params.batchTotal)) {
    return { total: Math.round(params.batchTotal), source: "batch" };
  }
  const sumSim = params.operations.reduce(
    (s, op) => s + (op.simMontoAGirar ?? 0),
    0,
  );
  if (sumSim > 0) {
    return { total: Math.round(sumSim), source: "sum_sim" };
  }
  const sumNet = params.operations.reduce(
    (s, op) => s + (op.netAdvance ?? 0),
    0,
  );
  if (sumNet > 0) {
    return { total: Math.round(sumNet), source: "sum_net" };
  }
  return { total: null, source: "sum_net" };
}

export function batchMatchesDeposit(
  batchTotal: number,
  totalAbs: number,
): boolean {
  return Math.abs(batchTotal - totalAbs) <= BATCH_DEPOSIT_MATCH_TOLERANCE(totalAbs);
}

/**
 * Resuelve nombres de instalación en lote a partir de sus ids.
 * `FinanceDte.installationId` es un campo escalar (sin relación Prisma),
 * así que hacemos un único query por todo el set de candidatos en vez de
 * un include por fila. Devuelve un Map id→name para mapear barato.
 */
async function fetchInstallationNames(
  tenantId: string,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.crmInstallation.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ── Candidatos sugeridos ──

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Keywords históricos (fast path barato). */
function keywordsHitFactoringDeposit(
  text: string | null | undefined,
): boolean {
  if (!text) return false;
  const d = text.toLowerCase();
  return (
    d.includes("factor") ||
    d.includes("amifac") ||
    d.includes("factotal") ||
    d.includes("incofin") ||
    d.includes("eurocapital") ||
    d.includes("tanner") ||
    d.includes("progreso") ||
    d.includes("logros")
  );
}

/** Tokens numéricos tipo folio en glosa/referencia (4–7 dígitos). */
function extractCandidateFoliosFromGloss(raw: string): number[] {
  const found = new Set<number>();
  for (const m of raw.matchAll(/\d{4,7}\b/g)) {
    const n = Number.parseInt(m[0], 10);
    if (n >= 1000 && n <= 9_999_999) found.add(n);
  }
  return [...found];
}

/**
 * Keywords + catálogo `FinanceFactoringCompany`: RUT extraído de la glosa y/o
 * tokens de razón social presentes en descripción + referencia.
 */
export async function detectFactoringFromTx(
  tenantId: string,
  description: string | null | undefined,
  reference?: string | null | undefined,
): Promise<{
  isFactoring: boolean;
  companyId: string | null;
  companyRut: string | null;
}> {
  const gloss = `${description ?? ""} ${reference ?? ""}`.trim();
  if (!gloss) {
    return { isFactoring: false, companyId: null, companyRut: null };
  }

  const keywordHit =
    keywordsHitFactoringDeposit(description) ||
    keywordsHitFactoringDeposit(reference);

  const companies = await prisma.financeFactoringCompany.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, rut: true, razonSocial: true },
  });

  const rutCanon =
    extractCanonicalRutFromBankText(description) ??
    extractCanonicalRutFromBankText(reference);
  const rutNorm = rutCanon ? normalizeRutForMatch(rutCanon) : null;

  let matchByRut: { id: string; rutNorm: string } | null = null;
  if (rutNorm) {
    for (const co of companies) {
      const k = normalizeRutForMatch(co.rut);
      if (k && k === rutNorm) {
        matchByRut = { id: co.id, rutNorm: k };
        break;
      }
    }
  }

  const glossLower = stripDiacritics(gloss.toLowerCase());
  let matchByName: { id: string } | null = null;
  for (const co of companies) {
    const tokens = stripDiacritics(co.razonSocial.toLowerCase()).split(/\s+/);
    for (const tok of tokens) {
      if (tok.length >= 4 && glossLower.includes(tok)) {
        matchByName = { id: co.id };
        break;
      }
    }
    if (matchByName) break;
  }

  const companyId = matchByRut?.id ?? matchByName?.id ?? null;
  let companyRut: string | null = matchByRut?.rutNorm ?? null;
  if (!companyRut && companyId) {
    const co = companies.find((c) => c.id === companyId);
    const k = co ? normalizeRutForMatch(co.rut) : "";
    companyRut = k || null;
  }

  const isFactoring =
    keywordHit || matchByRut !== null || matchByName !== null;

  return { isFactoring, companyId, companyRut };
}

/**
 * Pesos sumados y clamp 0–100 (ajustables): monto vs expectedDeposit ~45,
 * fecha cesión vs tx (21 días) ~25, folio en glosa ~20, empresa detectada ~15,
 * cociente banco/bruto ∈ [0.92, 1] ~15.
 */
function scoreFactoringOperationCandidate(params: {
  bankAmount: number;
  txDate: Date;
  glossNorm: string;
  folioSet: Set<number>;
  detectionCompanyId: string | null;
  invoiceAmount: number;
  expectedDeposit: number;
  fechaCesion: Date | null;
  factoringCompanyId: string | null;
  dteFolio: number | null;
}): { confidence: number; matchSignals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const expected = params.expectedDeposit;
  if (expected > 0) {
    const relErr = Math.abs(params.bankAmount - expected) / expected;
    const amountFactor = Math.max(0, 1 - Math.min(1, relErr));
    score += amountFactor * 45;
    if (amountFactor >= 0.92) signals.push("monto_simulacion");
  }

  const inv = params.invoiceAmount;
  if (inv > 0) {
    const ratio = params.bankAmount / inv;
    if (ratio >= 0.92 && ratio <= 1.0) {
      score += 15;
      signals.push("banda_factura_bruta");
    }
  }

  if (params.fechaCesion) {
    const days =
      Math.abs(params.txDate.getTime() - params.fechaCesion.getTime()) /
      86_400_000;
    const dateFactor = Math.max(0, 1 - Math.min(1, days / 21));
    score += dateFactor * 25;
    if (dateFactor >= 0.6) signals.push("fecha_cesion");
  }

  if (
    params.detectionCompanyId &&
    params.factoringCompanyId &&
    params.detectionCompanyId === params.factoringCompanyId
  ) {
    score += 15;
    signals.push("rut_factoring");
  }

  if (params.dteFolio != null) {
    const fs = String(params.dteFolio);
    if (params.glossNorm.includes(fs) || params.folioSet.has(params.dteFolio)) {
      score += 20;
      signals.push("folio_en_glosa");
    }
  }

  const confidence = Math.round(Math.max(0, Math.min(100, score)));
  return { confidence, matchSignals: [...new Set(signals)] };
}

type ReconcileDteRow = {
  id: string;
  direction: string;
  code: string;
  dteType: number;
  folio: number;
  issuerName: string | null;
  receiverName: string | null;
  receiverRut: string | null;
  issuerRut: string | null;
  totalAmount: { toNumber(): number };
  amountPaid: { toNumber(): number };
  amountPending: { toNumber(): number };
  date: Date;
  paymentStatus: string;
  installationId: string | null;
  notes: string | null;
  siiStatus?: string;
};

function mergeDteRowsById(
  priority: ReconcileDteRow[],
  rest: ReconcileDteRow[],
): ReconcileDteRow[] {
  const seen = new Set<string>();
  const out: ReconcileDteRow[] = [];
  for (const d of [...priority, ...rest]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

function toCandidateDte(
  d: ReconcileDteRow,
  instNames: Map<string, string>,
): CandidateDte {
  return {
    id: d.id,
    direction: d.direction as "ISSUED" | "RECEIVED",
    documentType: d.code,
    dteType: d.dteType,
    folio: d.folio,
    issuerName: d.issuerName ?? "",
    receiverName: d.receiverName ?? "",
    receiverRut: d.receiverRut ?? null,
    issuerRut: d.issuerRut ?? null,
    total: d.totalAmount.toNumber(),
    amountPaid: d.amountPaid.toNumber(),
    amountPending: d.amountPending.toNumber(),
    issuedAt: d.date.toISOString(),
    paymentStatus: d.paymentStatus,
    installationName: d.installationId
      ? instNames.get(d.installationId) ?? null
      : null,
    glosa: d.notes ?? null,
  };
}

/**
 * Carga DTEs conciliables: primero los que calzan el monto del banco
 * (para que el match no se caiga del `take: 200` por fecha), después
 * los más recientes de la ventana. El caller filtra links/CEDED y ordena.
 */
async function loadReconcileDteRows(params: {
  tenantId: string;
  direction: "ISSUED" | "RECEIVED";
  isFactoring: boolean;
  minDate: Date;
  maxDate: Date;
  amountAbs: number;
}): Promise<ReconcileDteRow[]> {
  const baseWhere: Prisma.FinanceDteWhereInput = {
    tenantId: params.tenantId,
    direction: params.direction,
    ...RECONCILE_ELIGIBLE_DTE,
    paymentStatus: {
      in: (params.isFactoring
        ? ["UNPAID", "PARTIAL", "OVERDUE", "PAID"]
        : ["UNPAID", "PARTIAL", "OVERDUE"]) as Prisma.EnumFinancePaymentStatusFilter["in"],
    },
    ...(params.isFactoring ? {} : { amountPending: { gt: 0 } }),
    date: { gte: params.minDate, lte: params.maxDate },
  };
  const amountBand = {
    gte: params.amountAbs - 1,
    lte: params.amountAbs + 1,
  };

  const [exactRows, recentRows] = await Promise.all([
    prisma.financeDte.findMany({
      where: {
        ...baseWhere,
        OR: [{ amountPending: amountBand }, { totalAmount: amountBand }],
      },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.financeDte.findMany({
      where: baseWhere,
      orderBy: { date: "desc" },
      take: 200,
    }),
  ]);

  return mergeDteRowsById(
    exactRows as unknown as ReconcileDteRow[],
    recentRows as unknown as ReconcileDteRow[],
  );
}

async function finalizeReconcileDteCandidates(params: {
  tenantId: string;
  rows: ReconcileDteRow[];
  isFactoring: boolean;
  amountAbs: number;
}): Promise<CandidateDte[]> {
  let filtered = params.rows;
  if (!params.isFactoring && filtered.length > 0) {
    const dteIds = filtered.map((d) => d.id);
    const linked = await prisma.financeBankTransactionLink.findMany({
      where: {
        tenantId: params.tenantId,
        targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
        targetId: { in: dteIds },
      },
      select: { targetId: true },
    });
    const linkedSet = new Set(
      linked.map((l) => l.targetId).filter((x): x is string => !!x),
    );
    filtered = filtered.filter((d) => !linkedSet.has(d.id));
  }

  filtered = filtered.filter(
    (d) =>
      d.paymentStatus !== "CEDED" &&
      d.folio > 0 &&
      d.siiStatus !== "DRAFT",
  );

  const instNames = await fetchInstallationNames(
    params.tenantId,
    filtered.map((d) => d.installationId),
  );

  return sortDteCandidatesByAmountMatch(
    filtered.map((d) => toCandidateDte(d, instNames)),
    params.amountAbs,
  );
}

/**
 * Busca DTEs candidatos para conciliar con un movimiento bancario:
 * ingreso → emitidos; egreso → recibidos. Si `detectFactoringFromTx` marca
 * factoring, amplía la ventana de fechas como antes.
 *
 * Ordena por afinidad de monto (match exacto primero). Excluye borradores,
 * NC/ND, facturas anuladas por NC total y rechazadas/anuladas en SII.
 */
export async function findDteCandidates(
  tenantId: string,
  bankTxId: string,
): Promise<CandidateDte[]> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: {
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (!tx) return [];

  const amountAbs = Math.abs(tx.amount.toNumber());
  if (amountAbs === 0) return [];

  const isIncome = tx.amount.toNumber() > 0;
  const direction = isIncome ? "ISSUED" : "RECEIVED";
  const detection = await detectFactoringFromTx(
    tenantId,
    tx.description,
    tx.reference,
  );
  const isFactoring = isIncome && detection.isFactoring;

  const minDate = new Date(tx.transactionDate);
  minDate.setDate(minDate.getDate() - (isFactoring ? 180 : 90));
  const maxDate = new Date(tx.transactionDate);
  maxDate.setDate(maxDate.getDate() + (isFactoring ? 7 : 30));

  const rows = await loadReconcileDteRows({
    tenantId,
    direction,
    isFactoring,
    minDate,
    maxDate,
    amountAbs,
  });

  return finalizeReconcileDteCandidates({
    tenantId,
    rows,
    isFactoring,
    amountAbs,
  });
}

/**
 * Versión bulk de `findDteCandidates`. Recibe N bankTxIds (selección
 * múltiple del usuario) y devuelve DTEs candidatos ordenados por
 * afinidad al MONTO TOTAL ABSOLUTO de los movimientos (match exacto primero).
 *
 * - La dirección (ISSUED/RECEIVED) se decide por el signo de la SUMA:
 *   suma > 0 → ingreso → buscamos ventas (ISSUED).
 *   suma < 0 → egreso  → buscamos compras (RECEIVED).
 * - La ventana de fecha se calcula desde min/max de las
 *   `transactionDate` de los movimientos.
 * - Detecta factoring desde la glosa del movimiento de mayor monto
 *   (misma heurística que single) para ampliar ventana y estados.
 * - CEDED nunca se ofrece como candidato DTE (salvaguarda contable).
 * - Borradores nunca se ofrecen (siiStatus=DRAFT / folio 0).
 * - Excluye DTEs ya conciliados con CUALQUIERA de los bankTxIds.
 * - Excluye NC/ND y anuladas por NC/SII.
 */
export async function findDteCandidatesForBulk(
  tenantId: string,
  bankTxIds: string[],
): Promise<CandidateDte[]> {
  if (bankTxIds.length === 0) return [];
  if (bankTxIds.length === 1) {
    return findDteCandidates(tenantId, bankTxIds[0]);
  }

  const txs = await prisma.financeBankTransaction.findMany({
    where: { id: { in: bankTxIds }, tenantId },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (txs.length === 0) return [];

  const totalSigned = txs.reduce((s, t) => s + t.amount.toNumber(), 0);
  const totalAbs = Math.abs(totalSigned);
  if (totalAbs === 0) return [];

  const isIncome = totalSigned > 0;
  const direction = isIncome ? "ISSUED" : "RECEIVED";

  const largest = [...txs].sort(
    (a, b) => Math.abs(b.amount.toNumber()) - Math.abs(a.amount.toNumber()),
  )[0]!;
  const detection = await detectFactoringFromTx(
    tenantId,
    largest.description,
    largest.reference,
  );
  const isFactoring = isIncome && detection.isFactoring;

  const dates = txs.map((t) => t.transactionDate.getTime());
  const minDate = new Date(Math.min(...dates));
  minDate.setDate(minDate.getDate() - (isFactoring ? 180 : 90));
  const maxDate = new Date(Math.max(...dates));
  maxDate.setDate(maxDate.getDate() + (isFactoring ? 7 : 30));

  const rows = await loadReconcileDteRows({
    tenantId,
    direction,
    isFactoring,
    minDate,
    maxDate,
    amountAbs: totalAbs,
  });

  return finalizeReconcileDteCandidates({
    tenantId,
    rows,
    isFactoring,
    amountAbs: totalAbs,
  });
}

/**
 * Query interna de operaciones de factoring. La banda de monto es opcional
 * (rama prioritaria por empresa detectada la omite).
 */
async function queryFactoringOps(params: {
  tenantId: string;
  companyId?: string | null;
  minDate: Date;
  maxDate: Date;
  amountBand?: { minAmount: number; maxAmount: number; invoiceMax?: number };
  folios?: number[];
  take: number;
}): Promise<FactoringOpRow[]> {
  const amountBandOr: Prisma.FinanceFactoringOperationWhereInput[] | null =
    params.amountBand
      ? [
          {
            simMontoAGirar: {
              gte: params.amountBand.minAmount,
              lte: params.amountBand.maxAmount,
            },
          },
          {
            netAdvance: {
              gte: params.amountBand.minAmount,
              lte: params.amountBand.maxAmount,
            },
          },
          ...(params.amountBand.invoiceMax != null
            ? [
                {
                  invoiceAmount: {
                    gte: params.amountBand.minAmount,
                    lte: params.amountBand.invoiceMax,
                  },
                },
              ]
            : []),
        ]
      : null;

  const dateAndAmount: Prisma.FinanceFactoringOperationWhereInput = {
    fechaCesion: { gte: params.minDate, lte: params.maxDate },
    ...(amountBandOr ? { OR: amountBandOr } : {}),
  };

  const orBranches: Prisma.FinanceFactoringOperationWhereInput[] = [
    dateAndAmount,
  ];
  if (params.folios && params.folios.length > 0) {
    orBranches.push({ dte: { folio: { in: params.folios } } });
  }

  const rows = await prisma.financeFactoringOperation.findMany({
    where: {
      tenantId: params.tenantId,
      status: { notIn: ["CANCELLED"] },
      ...(params.companyId ? { factoringCompanyId: params.companyId } : {}),
      // Excluir cesiones cuya factura esté anulada por NC / SII / sea NC-ND.
      dte: RECONCILE_ELIGIBLE_DTE,
      OR: orBranches,
    },
    select: FACTORING_OP_SELECT,
    orderBy: [{ dte: { date: "desc" } }, { fechaCesion: "desc" }],
    take: params.take,
  });
  return (rows as unknown as FactoringOpRow[]).filter(
    (op) => !isIneligibleReconcileDte(op.dte),
  );
}

async function mapOpsToCandidates(
  tenantId: string,
  ops: FactoringOpRow[],
  scoreCtx: {
    bankAmount: number;
    txDate: Date;
    glossNorm: string;
    folioSet: Set<number>;
    detectionCompanyId: string | null;
  },
): Promise<CandidateFactoring[]> {
  const instNames = await fetchInstallationNames(
    tenantId,
    ops.map((op) => op.dte?.installationId),
  );

  return ops
    .filter((op) => !isIneligibleReconcileDte(op.dte))
    .map((op) => {
      const sim = decimalToNumber(op.simMontoAGirar);
      const net = decimalToNumber(op.netAdvance) ?? 0;
      const expectedDeposit = sim ?? net;
      const invoiceAmount = decimalToNumber(op.invoiceAmount) ?? 0;
      const fechaCesion = op.fechaCesion ? new Date(op.fechaCesion) : null;
      const batchTotal = decimalToNumber(op.batch?.totalMontoAGirar ?? null);

      const { confidence, matchSignals } = scoreFactoringOperationCandidate({
        bankAmount: scoreCtx.bankAmount,
        txDate: scoreCtx.txDate,
        glossNorm: scoreCtx.glossNorm,
        folioSet: scoreCtx.folioSet,
        detectionCompanyId: scoreCtx.detectionCompanyId,
        invoiceAmount,
        expectedDeposit,
        fechaCesion,
        factoringCompanyId: op.factoringCompanyId ?? null,
        dteFolio: op.dte?.folio ?? null,
      });

      return {
        id: op.id,
        code: op.code,
        factoringCompanyName: op.factoringCompany,
        factoringCompanyId: op.factoringCompanyId ?? null,
        fechaCesion: op.fechaCesion ? op.fechaCesion.toISOString() : "",
        fechaVencimiento: op.fechaVencimiento
          ? op.fechaVencimiento.toISOString()
          : "",
        invoiceAmount,
        expectedDeposit,
        expectedDepositSource:
          sim != null ? ("simulation" as const) : ("computed" as const),
        status: op.status,
        dteFolio: op.dte?.folio ?? null,
        dteReceiverName: op.dte?.receiverName ?? null,
        dteIssuedAt: op.dte?.date ? op.dte.date.toISOString() : null,
        installationName: op.dte?.installationId
          ? instNames.get(op.dte.installationId) ?? null
          : null,
        confidence,
        matchSignals,
        isSuggested: confidence >= 90,
        batchId: op.batchId ?? op.batch?.id ?? null,
        batchCode: op.batch?.code ?? null,
        batchTotalMontoAGirar: batchTotal,
        batchOperationsCount: op.batch?.operationsCount ?? null,
      };
    });
}

function mergeCandidatesById(
  lists: CandidateFactoring[][],
  detectionCompanyId?: string | null,
): CandidateFactoring[] {
  const byId = new Map<string, CandidateFactoring>();
  for (const list of lists) {
    for (const c of list) {
      const prev = byId.get(c.id);
      if (!prev || c.confidence > prev.confidence) byId.set(c.id, c);
    }
  }
  return [...byId.values()].sort((a, b) => {
    // Empresa detectada primero: evita que otra factoring en banda
    // de monto quede por encima de cesiones SCF fuera de banda.
    if (detectionCompanyId) {
      const aHit = a.factoringCompanyId === detectionCompanyId ? 1 : 0;
      const bHit = b.factoringCompanyId === detectionCompanyId ? 1 : 0;
      if (aHit !== bHit) return bHit - aHit;
    }
    // Luego por fecha de emisión del DTE (más reciente primero).
    const aDate = a.dteIssuedAt || a.fechaCesion || "";
    const bDate = b.dteIssuedAt || b.fechaCesion || "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return b.confidence - a.confidence;
  });
}

/**
 * Cesiones candidatas con dos ramas:
 *  A) empresa detectada + ventana fecha −90/+15, sin banda de monto
 *  B) banda de monto + fecha (comportamiento histórico)
 * Deduplica por id, puntúa y corta a 60.
 */
export async function findFactoringCandidates(
  tenantId: string,
  bankTxId: string,
  toleranceFactor: number = 0.05,
): Promise<CandidateFactoring[]> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: {
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (!tx) return [];
  const amount = tx.amount.toNumber();
  if (amount <= 0) return []; // Sólo ingresos.

  const detection = await detectFactoringFromTx(
    tenantId,
    tx.description,
    tx.reference,
  );
  const isFactoring = detection.isFactoring;

  const tolerance = isFactoring
    ? Math.max(amount * 0.25, 1000)
    : Math.max(amount * toleranceFactor, 1000);
  const minAmount = isFactoring ? amount * 0.5 : amount - tolerance;
  const maxAmount = amount + tolerance;

  const bandMinDate = new Date(tx.transactionDate);
  bandMinDate.setDate(bandMinDate.getDate() - (isFactoring ? 60 : 14));
  const bandMaxDate = new Date(tx.transactionDate);
  bandMaxDate.setDate(bandMaxDate.getDate() + (isFactoring ? 7 : 1));

  const companyMinDate = new Date(tx.transactionDate);
  companyMinDate.setDate(companyMinDate.getDate() - 90);
  const companyMaxDate = new Date(tx.transactionDate);
  companyMaxDate.setDate(companyMaxDate.getDate() + 15);

  const glossRaw = `${tx.description ?? ""} ${tx.reference ?? ""}`;
  const glossNorm = stripDiacritics(glossRaw.toLowerCase());
  const folioList = extractCandidateFoliosFromGloss(glossRaw);
  const folioSet = new Set(folioList);
  const txDate =
    tx.transactionDate instanceof Date
      ? tx.transactionDate
      : new Date(tx.transactionDate);

  const scoreCtx = {
    bankAmount: amount,
    txDate,
    glossNorm,
    folioSet,
    detectionCompanyId: detection.companyId,
  };

  const [branchA, branchB] = await Promise.all([
    detection.companyId
      ? queryFactoringOps({
          tenantId,
          companyId: detection.companyId,
          minDate: companyMinDate,
          maxDate: companyMaxDate,
          folios: folioList,
          take: 60,
        })
      : Promise.resolve([] as FactoringOpRow[]),
    queryFactoringOps({
      tenantId,
      minDate: bandMinDate,
      maxDate: bandMaxDate,
      amountBand: {
        minAmount,
        maxAmount,
        invoiceMax: isFactoring ? amount * 1.5 : undefined,
      },
      folios: folioList,
      take: 100,
    }),
  ]);

  const mapped = await mapOpsToCandidates(
    tenantId,
    [...branchA, ...branchB],
    scoreCtx,
  );
  return mergeCandidatesById([mapped], detection.companyId).slice(0, 60);
}

/**
 * Versión bulk: une candidatos per-tx (glosas distintas) + una pasada contra
 * la SUMA absoluta del lote (causa raíz: cesiones grandes invisibles).
 */
export async function findFactoringCandidatesForBulk(
  tenantId: string,
  bankTxIds: string[],
): Promise<CandidateFactoring[]> {
  if (bankTxIds.length === 0) return [];
  if (bankTxIds.length === 1) {
    return findFactoringCandidates(tenantId, bankTxIds[0]);
  }

  const txs = await prisma.financeBankTransaction.findMany({
    where: { id: { in: bankTxIds }, tenantId },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (txs.length === 0) return [];

  const totalAbs = txs.reduce((s, t) => s + Math.abs(t.amount.toNumber()), 0);
  if (totalAbs <= 0) return [];

  const largest = [...txs].sort(
    (a, b) => Math.abs(b.amount.toNumber()) - Math.abs(a.amount.toNumber()),
  )[0]!;
  const detection = await detectFactoringFromTx(
    tenantId,
    largest.description,
    largest.reference,
  );

  const dates = txs.map((t) => t.transactionDate.getTime());
  const companyMinDate = new Date(Math.min(...dates));
  companyMinDate.setDate(companyMinDate.getDate() - 90);
  const companyMaxDate = new Date(Math.max(...dates));
  companyMaxDate.setDate(companyMaxDate.getDate() + 15);

  const bandMinDate = new Date(Math.min(...dates));
  bandMinDate.setDate(bandMinDate.getDate() - (detection.isFactoring ? 60 : 14));
  const bandMaxDate = new Date(Math.max(...dates));
  bandMaxDate.setDate(bandMaxDate.getDate() + (detection.isFactoring ? 7 : 1));

  const glossRaw = txs
    .map((t) => `${t.description ?? ""} ${t.reference ?? ""}`)
    .join(" ");
  const glossNorm = stripDiacritics(glossRaw.toLowerCase());
  const folioList = extractCandidateFoliosFromGloss(glossRaw);
  const folioSet = new Set(folioList);
  const txDate = new Date(Math.max(...dates));

  const tolerance = detection.isFactoring
    ? Math.max(totalAbs * 0.25, 1000)
    : Math.max(totalAbs * 0.05, 1000);
  const minAmount = detection.isFactoring ? totalAbs * 0.5 : totalAbs - tolerance;
  const maxAmount = totalAbs + tolerance;

  const scoreCtx = {
    bankAmount: totalAbs,
    txDate,
    glossNorm,
    folioSet,
    detectionCompanyId: detection.companyId,
  };

  const [branchA, branchB, perTx] = await Promise.all([
    detection.companyId
      ? queryFactoringOps({
          tenantId,
          companyId: detection.companyId,
          minDate: companyMinDate,
          maxDate: companyMaxDate,
          folios: folioList,
          take: 60,
        })
      : Promise.resolve([] as FactoringOpRow[]),
    queryFactoringOps({
      tenantId,
      minDate: bandMinDate,
      maxDate: bandMaxDate,
      amountBand: {
        minAmount,
        maxAmount,
        invoiceMax: detection.isFactoring ? totalAbs * 1.5 : undefined,
      },
      folios: folioList,
      take: 100,
    }),
    Promise.all(bankTxIds.map((id) => findFactoringCandidates(tenantId, id))),
  ]);

  const fromTotal = await mapOpsToCandidates(
    tenantId,
    [...branchA, ...branchB],
    scoreCtx,
  );
  return mergeCandidatesById(
    [fromTotal, ...perTx],
    detection.companyId,
  ).slice(0, 60);
}

/**
 * Lotes de cesión de la empresa detectada dentro de la ventana de fecha.
 * Ordena con matchesDeposit primero.
 */
export async function findFactoringBatches(
  tenantId: string,
  params: {
    companyId: string;
    minDate: Date;
    maxDate: Date;
    totalAbs: number;
  },
): Promise<CandidateFactoringBatch[]> {
  const batches = await prisma.financeFactoringBatch.findMany({
    where: {
      tenantId,
      factoringCompanyId: params.companyId,
      fechaCesion: { gte: params.minDate, lte: params.maxDate },
    },
    select: {
      id: true,
      code: true,
      fechaCesion: true,
      totalMontoAGirar: true,
      operationsCount: true,
      factoringCompany: { select: { razonSocial: true } },
      operations: {
        where: { status: { notIn: ["CANCELLED"] }, tenantId },
        select: {
          id: true,
          simMontoAGirar: true,
          netAdvance: true,
        },
      },
    },
    orderBy: { fechaCesion: "desc" },
    take: 40,
  });

  const mapped: CandidateFactoringBatch[] = [];
  for (const b of batches) {
    // Lote de una sola operación: se ofrece como cesión suelta, no tarjeta.
    if (b.operations.length <= 1) continue;

    const { total, source } = resolveBatchTotal({
      batchTotal: decimalToNumber(b.totalMontoAGirar),
      operations: b.operations.map((op) => ({
        simMontoAGirar: decimalToNumber(op.simMontoAGirar),
        netAdvance: decimalToNumber(op.netAdvance),
      })),
    });
    if (total == null) continue;

    mapped.push({
      id: b.id,
      code: b.code,
      factoringCompanyName: b.factoringCompany.razonSocial,
      fechaCesion: b.fechaCesion.toISOString(),
      operationsCount: b.operations.length,
      totalMontoAGirar: total,
      totalSource: source,
      matchesDeposit: batchMatchesDeposit(total, params.totalAbs),
      operationIds: b.operations.map((op) => op.id),
    });
  }

  mapped.sort((a, b) => {
    if (a.matchesDeposit !== b.matchesDeposit) {
      return a.matchesDeposit ? -1 : 1;
    }
    return (
      Math.abs(a.totalMontoAGirar - params.totalAbs) -
      Math.abs(b.totalMontoAGirar - params.totalAbs)
    );
  });
  return mapped;
}

/**
 * Resuelve contexto de fechas/monto/empresa desde bankTxIds (tenant-scoped).
 */
async function resolveBankTxContext(
  tenantId: string,
  bankTxIds: string[],
): Promise<{
  totalAbs: number;
  companyId: string | null;
  isFactoring: boolean;
  minDate: Date;
  maxDate: Date;
  glossRaw: string;
  largestDescription: string | null;
  largestReference: string | null;
} | null> {
  const txs = await prisma.financeBankTransaction.findMany({
    where: { id: { in: bankTxIds }, tenantId },
    select: {
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (txs.length === 0) return null;

  const totalAbs = txs.reduce((s, t) => s + Math.abs(t.amount.toNumber()), 0);
  const largest = [...txs].sort(
    (a, b) => Math.abs(b.amount.toNumber()) - Math.abs(a.amount.toNumber()),
  )[0]!;
  const detection = await detectFactoringFromTx(
    tenantId,
    largest.description,
    largest.reference,
  );
  const dates = txs.map((t) => t.transactionDate.getTime());
  const minDate = new Date(Math.min(...dates));
  minDate.setDate(minDate.getDate() - 90);
  const maxDate = new Date(Math.max(...dates));
  maxDate.setDate(maxDate.getDate() + 15);

  return {
    totalAbs,
    companyId: detection.companyId,
    isFactoring: detection.isFactoring,
    minDate,
    maxDate,
    glossRaw: txs
      .map((t) => `${t.description ?? ""} ${t.reference ?? ""}`)
      .join(" "),
    largestDescription: largest.description,
    largestReference: largest.reference,
  };
}

/** Carga lotes de factoring para los endpoints de candidatos. */
export async function findFactoringBatchesForBankTxs(
  tenantId: string,
  bankTxIds: string[],
): Promise<CandidateFactoringBatch[]> {
  const ctx = await resolveBankTxContext(tenantId, bankTxIds);
  if (!ctx || !ctx.companyId || ctx.totalAbs <= 0) return [];
  return findFactoringBatches(tenantId, {
    companyId: ctx.companyId,
    minDate: ctx.minDate,
    maxDate: ctx.maxDate,
    totalAbs: ctx.totalAbs,
  });
}

/**
 * Búsqueda server-side de candidatos (folio, razón social, RUT, instalación,
 * código de cesión). Aplica la regla CEDED → cesión.
 */
export async function searchReconcileCandidates(
  tenantId: string,
  params: {
    bankTxIds: string[];
    query: string;
    scope?: ReconcileSearchScope;
    limit?: number;
  },
): Promise<{ data: CandidateDte[]; factoring: CandidateFactoring[] }> {
  const q = params.query.trim();
  if (!q || params.bankTxIds.length === 0) {
    return { data: [], factoring: [] };
  }
  if (q.length > 80) {
    return { data: [], factoring: [] };
  }

  const ctx = await resolveBankTxContext(tenantId, params.bankTxIds);
  if (!ctx) return { data: [], factoring: [] };

  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const scope: ReconcileSearchScope =
    params.scope ??
    (ctx.companyId || ctx.isFactoring ? "factoring" : "open");

  const isNumeric = /^\d{3,7}$/.test(q);
  const folioNum = isNumeric ? Number.parseInt(q, 10) : null;
  const rutNorm = normalizeRutForMatch(q);
  const qLower = stripDiacritics(q.toLowerCase());

  // Instalaciones por nombre (solo texto libre; queries numéricas van por folio).
  let instIds: string[] = [];
  if (!isNumeric) {
    const instMatches = await prisma.crmInstallation.findMany({
      where: { tenantId, name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 50,
    });
    instIds = instMatches.map((i) => i.id);
  }

  const wantOpen = scope === "open" || scope === "all";
  const wantFactoring =
    scope === "factoring" || scope === "ceded" || scope === "all";

  let dteCandidates: CandidateDte[] = [];
  let factoringCandidates: CandidateFactoring[] = [];

  if (wantOpen) {
    const dteWhere: Prisma.FinanceDteWhereInput = {
      tenantId,
      ...RECONCILE_ELIGIBLE_DTE,
      paymentStatus: {
        in: ["UNPAID", "PARTIAL", "OVERDUE"] as Prisma.EnumFinancePaymentStatusFilter["in"],
      },
      amountPending: { gt: 0 },
      OR: [
        ...(folioNum != null ? [{ folio: folioNum }] : []),
        { receiverName: { contains: q, mode: "insensitive" as const } },
        { issuerName: { contains: q, mode: "insensitive" as const } },
        { notes: { contains: q, mode: "insensitive" as const } },
        ...(instIds.length ? [{ installationId: { in: instIds } }] : []),
        ...(rutNorm
          ? [
              { receiverRut: { contains: rutNorm.replace(/[^0-9kK]/g, ""), mode: "insensitive" as const } },
              { issuerRut: { contains: rutNorm.replace(/[^0-9kK]/g, ""), mode: "insensitive" as const } },
            ]
          : []),
      ],
    };

    const dtes = await prisma.financeDte.findMany({
      where: dteWhere,
      orderBy: { date: "desc" },
      take: limit,
    });

    // Nunca CEDED como DTE.
    const openDtes = dtes.filter((d) => d.paymentStatus !== "CEDED");
    const instNames = await fetchInstallationNames(
      tenantId,
      openDtes.map((d) => d.installationId),
    );
    dteCandidates = sortDteCandidatesByAmountMatch(
      openDtes.map((d) =>
        toCandidateDte(d as unknown as ReconcileDteRow, instNames),
      ),
      ctx.totalAbs,
    );
  }

  if (wantFactoring) {
    const dteTextFilter: Prisma.FinanceDteWhereInput = {
      ...RECONCILE_ELIGIBLE_DTE,
      OR: [
        { receiverName: { contains: q, mode: "insensitive" as const } },
        { issuerName: { contains: q, mode: "insensitive" as const } },
        { notes: { contains: q, mode: "insensitive" as const } },
        ...(folioNum != null ? [{ folio: folioNum }] : []),
      ],
      ...(scope === "ceded" ? { paymentStatus: "CEDED" as const } : {}),
    };

    const opWhere: Prisma.FinanceFactoringOperationWhereInput = {
      tenantId,
      status: { notIn: ["CANCELLED"] },
      ...(scope === "factoring" && ctx.companyId
        ? { factoringCompanyId: ctx.companyId }
        : {}),
      dte: {
        ...RECONCILE_ELIGIBLE_DTE,
        ...(scope === "ceded" ? { paymentStatus: "CEDED" as const } : {}),
      },
      OR: [
        { code: { contains: q, mode: "insensitive" as const } },
        { factoringCompany: { contains: q, mode: "insensitive" as const } },
        ...(folioNum != null ? [{ dte: { folio: folioNum } }] : []),
        { dte: dteTextFilter },
      ],
    };

    const ops = await prisma.financeFactoringOperation.findMany({
      where: opWhere,
      select: FACTORING_OP_SELECT,
      orderBy: [{ dte: { date: "desc" } }, { fechaCesion: "desc" }],
      take: limit,
    });

    // Filtro adicional por nombre de instalación (no hay join directo).
    const instNames = await fetchInstallationNames(
      tenantId,
      (ops as unknown as FactoringOpRow[]).map((op) => op.dte?.installationId),
    );
    let filteredOps = ops as unknown as FactoringOpRow[];
    if (!isNumeric) {
      filteredOps = filteredOps.filter((op) => {
        const hay = [
          op.code,
          op.factoringCompany,
          String(op.dte?.folio ?? ""),
          op.dte?.receiverName ?? "",
          op.dte?.issuerName ?? "",
          op.dte?.notes ?? "",
          op.dte?.installationId
            ? instNames.get(op.dte.installationId) ?? ""
            : "",
        ]
          .join(" ")
          .toLowerCase();
        return stripDiacritics(hay).includes(qLower);
      });
    }

    const folioSet = new Set(
      extractCandidateFoliosFromGloss(ctx.glossRaw + " " + q),
    );
    factoringCandidates = await mapOpsToCandidates(tenantId, filteredOps, {
      bankAmount: ctx.totalAbs,
      txDate: ctx.maxDate,
      glossNorm: stripDiacritics((ctx.glossRaw + " " + q).toLowerCase()),
      folioSet,
      detectionCompanyId: ctx.companyId,
    });
  }

  // Si la búsqueda numérica encontró un DTE CEDED, elevar su cesión.
  if (folioNum != null && wantFactoring) {
    const ceded = await prisma.financeDte.findMany({
      where: {
        tenantId,
        folio: folioNum,
        paymentStatus: "CEDED",
        ...RECONCILE_ELIGIBLE_DTE,
      },
      select: { id: true },
      take: 10,
    });
    if (ceded.length > 0) {
      const existingIds = new Set(factoringCandidates.map((c) => c.id));
      const ops = await prisma.financeFactoringOperation.findMany({
        where: {
          tenantId,
          dteId: { in: ceded.map((d) => d.id) },
          status: { notIn: ["CANCELLED"] },
          dte: RECONCILE_ELIGIBLE_DTE,
          ...(scope === "factoring" && ctx.companyId
            ? { factoringCompanyId: ctx.companyId }
            : {}),
        },
        select: FACTORING_OP_SELECT,
        orderBy: [{ dte: { date: "desc" } }, { fechaCesion: "desc" }],
        take: limit,
      });
      const mapped = await mapOpsToCandidates(
        tenantId,
        ops as unknown as FactoringOpRow[],
        {
          bankAmount: ctx.totalAbs,
          txDate: ctx.maxDate,
          glossNorm: stripDiacritics((ctx.glossRaw + " " + q).toLowerCase()),
          folioSet: new Set([folioNum]),
          detectionCompanyId: ctx.companyId,
        },
      );
      for (const c of mapped) {
        if (!existingIds.has(c.id)) factoringCandidates.push(c);
      }
    }
  }

  // Scope open no debe devolver DTE; factoring/ceded no deben devolver open.
  if (scope === "factoring" || scope === "ceded") {
    dteCandidates = [];
  }
  if (scope === "open") {
    factoringCandidates = [];
  }

  return {
    data: sortDteCandidatesByAmountMatch(dteCandidates, ctx.totalAbs).slice(
      0,
      limit,
    ),
    factoring: factoringCandidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit),
  };
}

// ── Listar links existentes de una tx ──

/**
 * Forma plana de un link enriquecido para que el front pueda renderizar
 * la "vista resumen" del drawer sin hacer N+1 fetches por entidad.
 *
 * `entityLabel` siempre presente:
 *   - DTE_ISSUED / DTE_RECEIVED  → "Factura 1234 · Cliente XYZ"
 *   - FACTORING_OPERATION        → "Cesión OP-2026-001 · BCI Factoring"
 *   - EXPENSE / INCOME           → fila de flujo si hay, si no "Gasto manual: 5101 …"

 *   - PAYROLL_*, TE_LOTE         → fallback genérico con targetId
 */
export interface EnrichedTransactionLink {
  id: string;
  targetType: FinanceLinkTarget;
  targetId: string | null;
  amount: number;
  note: string | null;
  accountPlan: { id: string; code: string; name: string } | null;
  entityLabel: string;
  /** Solo presente para DTE — útil para link-out al detalle. */
  dte: {
    id: string;
    direction: "ISSUED" | "RECEIVED";
    documentType: string;
    folio: number;
    counterpartyName: string;
    paymentStatus: string;
    totalAmount: number;
  } | null;
  /** Solo presente para FACTORING_OPERATION. */
  factoring: {
    id: string;
    code: string;
    factoringCompanyName: string;
    /** Folio de la factura cedida (cuando el DTE asociado tiene folio). */
    dteFolio: number | null;
  } | null;
  allocations: EnrichedAllocation[];
}

export async function listTransactionLinks(
  tenantId: string,
  bankTxId: string
): Promise<EnrichedTransactionLink[]> {
  const linkInclude = {
    accountPlan: { select: { id: true, code: true, name: true } },
    flowRow: { select: { id: true, name: true } },
  } as const;

  let rows = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: bankTxId },
    include: linkInclude,
    orderBy: { createdAt: "asc" },
  });

  // Retrocompatibilidad: movimientos auto-conciliados/legacy que NO tienen
  // FinanceBankTransactionLink pero sí tienen una de estas señales de
  // conciliación previa:
  //   1) FinancePaymentRecord con bankTransactionId apuntando a esta tx.
  //   2) FinanceReconciliationMatch (modelo de período) que enlaza la tx
  //      con un paymentRecord (a través del cual llegamos a allocations).
  //   3) Allocations cuyo PaymentRecord NO tiene bankTransactionId pero el
  //      match de período sí lo asocia.
  //   4) FinanceCashflowOccurrence PAID (asignación v2 a categoría/fila).
  //      Se intenta persistir el BankTxLink faltante; si no hay cuenta, se
  //      sintetiza para que el drawer no muestre "conciliación inconsistente".
  //
  // En todos los casos sintetizamos un set de EnrichedTransactionLink para
  // que el drawer muestre modo "view" con tarjetas clickeables al DTE, y
  // las opciones de comparar/categorizar manual NO aparezcan.
  if (rows.length === 0) {
    const [paymentsDirect, reconcMatch, bankTx] = await Promise.all([
      prisma.financePaymentRecord.findMany({
        where: { tenantId, bankTransactionId: bankTxId },
        include: {
          allocations: {
            include: {
              dte: {
                select: {
                  id: true,
                  direction: true,
                  code: true,
                  folio: true,
                  issuerName: true,
                  receiverName: true,
                  paymentStatus: true,
                  totalAmount: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.financeReconciliationMatch.findFirst({
        where: { bankTransactionId: bankTxId },
        include: {
          paymentRecord: {
            include: {
              allocations: {
                include: {
                  dte: {
                    select: {
                      id: true,
                      direction: true,
                      code: true,
                      folio: true,
                      issuerName: true,
                      receiverName: true,
                      paymentStatus: true,
                      totalAmount: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.financeBankTransaction.findFirst({
        where: { id: bankTxId, tenantId },
        select: { amount: true },
      }),
    ]);

    // Dedupe: si la misma payment aparece directo y via reconcMatch, no
    // dupliquemos. Indexamos por id.
    const paymentsById = new Map<string, (typeof paymentsDirect)[number]>();
    for (const p of paymentsDirect) paymentsById.set(p.id, p);
    if (
      reconcMatch?.paymentRecord &&
      !paymentsById.has(reconcMatch.paymentRecord.id)
    ) {
      paymentsById.set(
        reconcMatch.paymentRecord.id,
        reconcMatch.paymentRecord as (typeof paymentsDirect)[number]
      );
    }

    if (paymentsById.size === 0) {
      try {
        const healed = await healBankTxLinkFromCashflowOccurrence(
          tenantId,
          bankTxId,
          null,
        );
        if (healed.created) {
          rows = await prisma.financeBankTransactionLink.findMany({
            where: { tenantId, bankTransactionId: bankTxId },
            include: linkInclude,
            orderBy: { createdAt: "asc" },
          });
        }
      } catch (err) {
        console.warn(
          "[Finance/Banking/Links] heal occurrence link failed",
          err,
        );
      }
      if (rows.length > 0) {
        // Fall through to enrichment below.
      } else {
        const occ = await prisma.financeCashflowOccurrence.findFirst({
          where: { tenantId, bankTransactionId: bankTxId },
          select: {
            id: true,
            amountClp: true,
            item: { select: { name: true, kind: true } },
          },
        });
        if (!occ?.item) return [];
        const isIncome = (bankTx?.amount?.toNumber() ?? 0) > 0;
        const amount =
          Math.abs(Number(occ.amountClp)) ||
          Math.abs(bankTx?.amount?.toNumber() ?? 0);
        return [
          {
            id: occ.id,
            targetType: isIncome ? "INCOME" : "EXPENSE",
            targetId: null,
            amount,
            note: `Asignado a flujo: ${occ.item.name}`,
            accountPlan: null,
            entityLabel: occ.item.name,
            dte: null,
            factoring: null,
            allocations: [],
          },
        ];
      }
    }

    const isIncome = (bankTx?.amount?.toNumber() ?? 0) > 0;
    const synthetic: EnrichedTransactionLink[] = [];
    for (const pay of paymentsById.values()) {
      for (const alloc of pay.allocations) {
        const d = alloc.dte;
        if (!d) continue;
        const counterparty =
          d.direction === "ISSUED"
            ? d.receiverName ?? ""
            : d.issuerName ?? "";
        synthetic.push({
          id: alloc.id,
          targetType: isIncome ? "DTE_ISSUED" : "DTE_RECEIVED",
          targetId: d.id,
          amount: alloc.amount.toNumber(),
          note: "Auto-match (vínculo sintetizado de registro de pago)",
          accountPlan: null,
          entityLabel: `${d.code} ${d.folio} · ${counterparty}`.trim(),
          dte: {
            id: d.id,
            direction: d.direction as "ISSUED" | "RECEIVED",
            documentType: d.code,
            folio: d.folio,
            counterpartyName: counterparty,
            paymentStatus: d.paymentStatus,
            totalAmount: d.totalAmount.toNumber(),
          },
          factoring: null,
          allocations: [],
        });
      }
    }
    if (rows.length === 0) return synthetic;
  }

  // Recolectamos los IDs de DTE y factoring para 2 queries batched, en
  // vez de N+1 por link.
  const dteIds = rows
    .filter(
      (r) => r.targetType === "DTE_ISSUED" || r.targetType === "DTE_RECEIVED"
    )
    .map((r) => r.targetId)
    .filter((id): id is string => !!id);
  const factoringIds = rows
    .filter((r) => r.targetType === "FACTORING_OPERATION")
    .map((r) => r.targetId)
    .filter((id): id is string => !!id);

  const [dtes, factorings] = await Promise.all([
    dteIds.length > 0
      ? prisma.financeDte.findMany({
          where: { tenantId, id: { in: dteIds } },
          select: {
            id: true,
            direction: true,
            code: true,
            folio: true,
            issuerName: true,
            receiverName: true,
            paymentStatus: true,
            totalAmount: true,
          },
        })
      : Promise.resolve([]),
    factoringIds.length > 0
      ? prisma.financeFactoringOperation.findMany({
          where: { tenantId, id: { in: factoringIds } },
          select: {
            id: true,
            code: true,
            factoringCompany: true,
            dte: { select: { folio: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const dteById = new Map(dtes.map((d) => [d.id, d]));
  const factoringById = new Map(factorings.map((f) => [f.id, f]));
  const allocationsByLink = await loadAllocationsForLinks(
    tenantId,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    let entityLabel = `${r.targetType}`;
    let dte: EnrichedTransactionLink["dte"] = null;
    let factoring: EnrichedTransactionLink["factoring"] = null;

    if (r.targetType === "DTE_ISSUED" || r.targetType === "DTE_RECEIVED") {
      const d = r.targetId ? dteById.get(r.targetId) : undefined;
      if (d) {
        const counterparty =
          d.direction === "ISSUED" ? d.receiverName ?? "" : d.issuerName ?? "";
        entityLabel = `${d.code} ${d.folio} · ${counterparty}`.trim();
        dte = {
          id: d.id,
          direction: d.direction as "ISSUED" | "RECEIVED",
          documentType: d.code,
          folio: d.folio,
          counterpartyName: counterparty,
          paymentStatus: d.paymentStatus,
          totalAmount: d.totalAmount.toNumber(),
        };
      } else {
        entityLabel = `DTE eliminado (id ${r.targetId ?? "?"})`;
      }
    } else if (r.targetType === "FACTORING_OPERATION") {
      const f = r.targetId ? factoringById.get(r.targetId) : undefined;
      if (f) {
        const folio = f.dte?.folio ?? null;
        entityLabel = folio
          ? `Cesión ${f.code} · Factura ${folio} · ${f.factoringCompany}`
          : `Cesión ${f.code} · ${f.factoringCompany}`;
        factoring = {
          id: f.id,
          code: f.code,
          factoringCompanyName: f.factoringCompany,
          dteFolio: folio,
        };
      } else {
        entityLabel = `Cesión eliminada (id ${r.targetId ?? "?"})`;
      }
    } else if (r.targetType === "EXPENSE" || r.targetType === "INCOME") {
      const kind = r.targetType === "INCOME" ? "Ingreso manual" : "Gasto manual";
      const rowName = r.flowRow?.name;
      if (rowName) {
        entityLabel = r.accountPlan
          ? `${rowName} · ${r.accountPlan.code} ${r.accountPlan.name}`
          : rowName;
      } else {
        entityLabel = r.accountPlan
          ? `${kind}: ${r.accountPlan.code} ${r.accountPlan.name}`
          : kind;
      }
    } else {
      entityLabel = `${r.targetType}${r.targetId ? ` · ${r.targetId.slice(0, 8)}` : ""}`;
    }

    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId ?? null,
      amount: r.amount.toNumber(),
      note: r.note ?? null,
      accountPlan: r.accountPlan ?? null,
      entityLabel,
      dte,
      factoring,
      allocations: allocationsByLink.get(r.id) ?? [],
    };
  });
}

// ── Reemplazar links (operación atómica) ──

export interface SetLinksOptions {
  /** Si true, se permite que la suma de links sea menor al monto. Default false. */
  allowPartial?: boolean;
}

/**
 * Reemplaza los links de una tx. Atómico: borra los previos y crea los
 * nuevos en una sola transacción. Actualiza reconciliationStatus de la tx
 * según si los links cubren el monto completo.
 *
 * Coherencia banco ↔ DTE (post 2026-05): cuando hay links a DTE_ISSUED o
 * DTE_RECEIVED, este service además:
 *   1. Revierte el FinancePaymentRecord previo creado por una conciliación
 *      anterior de esta misma tx (si existe), borrando sus allocations
 *      y recomputando amountPaid de los DTEs afectados.
 *   2. Crea un nuevo FinancePaymentRecord con bankTransactionId = tx.id,
 *      una FinancePaymentAllocation por cada link DTE y recomputa el
 *      payment aggregate de cada DTE afectado.
 *   3. Para links DTE el sourceOfTruth del "DTE pagado" pasa a ser el
 *      conjunto de allocations: el campo paymentStatus / amountPaid se
 *      deriva de aggregate(FinancePaymentAllocation.amount), no del delta.
 *
 * Para links EXPENSE / INCOME / FACTORING_OPERATION no se toca DTE ni se
 * crea PaymentRecord: solo el link y el asiento contable manual.
 */
export async function setTransactionLinks(
  tenantId: string,
  bankTxId: string,
  userId: string | null,
  links: BankTxLinkInput[],
  opts: SetLinksOptions = {}
): Promise<void> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: {
      id: true,
      amount: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });
  if (!tx) throw new Error("Movimiento no encontrado");

  // Validaciones
  for (const l of links) {
    if (!Number.isFinite(l.amount) || l.amount <= 0) {
      throw new Error("Cada link debe tener monto > 0");
    }
    if (l.targetType !== "EXPENSE" && l.targetType !== "INCOME" && !l.targetId) {
      throw new Error(
        `Link tipo ${l.targetType} requiere targetId (entidad vinculada)`
      );
    }
    if (
      (l.targetType === "EXPENSE" || l.targetType === "INCOME") &&
      !l.accountPlanId
    ) {
      throw new Error(
        "Categorización manual (EXPENSE/INCOME) requiere cuenta contable"
      );
    }
  }

  const txAmountAbs = Math.abs(tx.amount.toNumber());
  // Los links de tipo EXPENSE/INCOME pueden ser "ajustes contables" que
  // no consumen flujo bancario (típico shortfall: DTE-links suman el banco
  // y el costo factoring va como link EXPENSE adicional con accountPlanId).
  // Para validar el invariante "links cubren el banco" usamos solo los
  // links que SÍ representan flujo (DTE_* y categorizaciones manuales sin
  // DTE en paralelo).
  const dteOrManualLinksTotal = links.reduce((s, l) => {
    const isAdjustment =
      (l.targetType === "EXPENSE" || l.targetType === "INCOME") &&
      links.some(
        (other) =>
          other !== l &&
          (other.targetType === "DTE_ISSUED" || other.targetType === "DTE_RECEIVED"),
      );
    return isAdjustment ? s : s + l.amount;
  }, 0);
  if (dteOrManualLinksTotal > txAmountAbs + 0.01) {
    throw new Error(
      `Suma de vínculos ($${dteOrManualLinksTotal.toLocaleString("es-CL")}) supera el monto del movimiento ($${txAmountAbs.toLocaleString("es-CL")})`
    );
  }

  const isFullyCovered = Math.abs(dteOrManualLinksTotal - txAmountAbs) < 0.01;
  if (!isFullyCovered && !opts.allowPartial) {
    throw new Error(
      `La suma de vínculos no cubre el monto del movimiento. Faltan $${(txAmountAbs - dteOrManualLinksTotal).toLocaleString("es-CL")}. Asigná el resto a una cuenta contable.`
    );
  }

  const isIncome = tx.amount.toNumber() > 0;
  const dteLinks = links.filter(
    (l) => l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED"
  );

  const dteTargetIds = [
    ...new Set(
      dteLinks.map((l) => l.targetId).filter((x): x is string => !!x),
    ),
  ];
  if (dteTargetIds.length > 0) {
    const targetDtes = await prisma.financeDte.findMany({
      where: { tenantId, id: { in: dteTargetIds } },
      select: {
        id: true,
        siiStatus: true,
        folio: true,
        voidedByCreditNoteId: true,
        dteType: true,
      },
    });
    if (targetDtes.length !== dteTargetIds.length) {
      throw new Error(
        "Una o más facturas no existen o pertenecen a otro tenant",
      );
    }
    throwIfDtesIneligibleForReconcile(targetDtes);
  }

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    // 1. Revertir cualquier FinancePaymentRecord que esta misma tx haya
    //    creado en una conciliación previa: borrar sus allocations,
    //    cancelar el record y recordar los DTE afectados para recompute.
    const previousPayments = await tx2.financePaymentRecord.findMany({
      where: { tenantId, bankTransactionId: bankTxId },
      select: { id: true, allocations: { select: { dteId: true } } },
    });
    const dteIdsToRecompute = new Set<string>();
    for (const pay of previousPayments) {
      for (const a of pay.allocations) dteIdsToRecompute.add(a.dteId);
    }
    if (previousPayments.length > 0) {
      const ids = previousPayments.map((p) => p.id);
      await tx2.financePaymentAllocation.deleteMany({
        where: { paymentId: { in: ids } },
      });
      await tx2.financePaymentRecord.deleteMany({
        where: { id: { in: ids } },
      });
    }

    // 2. Reemplazar links polymorphic.
    await tx2.financeBankTransactionLink.deleteMany({
      where: { tenantId, bankTransactionId: bankTxId },
    });

    if (links.length > 0) {
      for (const l of links) {
        const created = await tx2.financeBankTransactionLink.create({
          data: {
            tenantId,
            bankTransactionId: bankTxId,
            targetType: l.targetType,
            targetId: l.targetId ?? null,
            amount: new Decimal(l.amount),
            accountPlanId: l.accountPlanId ?? null,
            flowRowId: l.flowRowId ?? null,
            note: l.note ?? null,
            matchSource: l.matchSource ?? null,
            matchedByRuleId: l.matchedByRuleId ?? null,
            createdById: userId ?? null,
          },
        });
        if (l.costCenter !== undefined) {
          await replaceLinkAllocations(tx2, {
            tenantId,
            linkId: created.id,
            linkAmount: l.amount,
            assignment: l.costCenter,
            refDate: tx.transactionDate,
          });
        }
      }
    }

    // 3. Si hay links a DTE, crear FinancePaymentRecord + allocations.
    if (dteLinks.length > 0) {
      const code = await nextPaymentRecordCode(tx2, tenantId, isIncome);
      const totalDteAmount = dteLinks.reduce((s, l) => s + l.amount, 0);
      const record = await tx2.financePaymentRecord.create({
        data: {
          tenantId,
          code,
          // DISBURSEMENT = pago a proveedor (egreso → DTE_RECEIVED).
          // COLLECTION  = cobro de cliente (ingreso → DTE_ISSUED).
          type: isIncome ? "COLLECTION" : "DISBURSEMENT",
          date: tx.transactionDate,
          amount: new Decimal(totalDteAmount),
          paymentMethod: "TRANSFER",
          bankAccountId: tx.bankAccountId,
          bankTransactionId: bankTxId,
          transferReference: tx.reference ?? null,
          notes: `Conciliación manual mov. bancario · ${tx.description}`.slice(
            0,
            500
          ),
          status: "CONFIRMED",
          createdBy: userId ?? "system",
        },
      });
      await tx2.financePaymentAllocation.createMany({
        data: dteLinks.map((l) => ({
          paymentId: record.id,
          dteId: l.targetId!,
          amount: new Decimal(l.amount),
        })),
      });
      for (const l of dteLinks) {
        if (l.targetId) dteIdsToRecompute.add(l.targetId);
      }
    }

    // 4. Recomputar payment aggregate de cada DTE tocado (los que perdieron
    //    allocation por la reversión + los que ganaron por los nuevos links).
    const bankAccForWriteOff = await tx2.financeBankAccount.findUnique({
      where: { id: tx.bankAccountId },
      select: { accountPlanId: true },
    });
    for (const dteId of Array.from(dteIdsToRecompute)) {
      await recomputeDtePaymentAggregate(tx2, dteId, {
        tenantId,
        paymentDate: tx.transactionDate,
        bankAccountPlanId: bankAccForWriteOff?.accountPlanId ?? null,
        userId,
      });
    }

    // 4b. Sincronizar reconciledAt en los DTEs. Estado de conciliación es
    //     INDEPENDIENTE de paymentStatus: lo refleja la presencia/ausencia
    //     de FinanceBankTransactionLink DTE_*.
    const newDteIds = dteLinks
      .map((l) => l.targetId)
      .filter((x): x is string => !!x);
    if (newDteIds.length > 0) {
      await tx2.financeDte.updateMany({
        where: { id: { in: newDteIds } },
        data: { reconciledAt: tx.transactionDate },
      });
    }
    // Los DTEs que estaban linkeados antes y dejaron de estarlo: si ya no
    // tienen NINGÚN link DTE_*, su reconciledAt vuelve a null.
    const removedDteIds = Array.from(dteIdsToRecompute).filter(
      (id) => !newDteIds.includes(id),
    );
    if (removedDteIds.length > 0) {
      const stillLinked = await tx2.financeBankTransactionLink.findMany({
        where: {
          tenantId,
          targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
          targetId: { in: removedDteIds },
        },
        select: { targetId: true },
      });
      const stillLinkedSet = new Set(
        stillLinked.map((l) => l.targetId).filter((x): x is string => !!x),
      );
      const toClear = removedDteIds.filter((id) => !stillLinkedSet.has(id));
      if (toClear.length > 0) {
        await tx2.financeDte.updateMany({
          where: { id: { in: toClear } },
          data: { reconciledAt: null },
        });
      }
    }

    // 5. Estado de conciliación de la tx.
    await tx2.financeBankTransaction.update({
      where: { id: bankTxId },
      data: {
        reconciliationStatus: isFullyCovered
          ? "MATCHED"
          : links.length > 0
            ? "MATCHED" // parcial pero conciliado lo registrado
            : "UNMATCHED",
      },
    });
  });

  // Asiento contable post-transacción (fuera del $transaction porque
  // createManualEntry abre su propio contexto y queremos que el fallo
  // del asiento no haga rollback de la conciliación).
  if (userId && links.length > 0) {
    const fullTx = await prisma.financeBankTransaction.findFirst({
      where: { id: bankTxId, tenantId },
      select: {
        id: true,
        bankAccountId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
      },
    });
    if (fullTx) {
      await generateJournalEntryForLinks(
        tenantId,
        userId,
        fullTx,
        links.map((l) => ({
          targetType: l.targetType,
          amount: new Decimal(l.amount),
          accountPlanId: l.accountPlanId ?? null,
          note: l.note ?? null,
        }))
      );
    }
  }
}

// ── Conciliación masiva N movimientos → 1 DTE ──

export interface BulkReconcileToDteInput {
  bankTransactionIds: string[];
  dteId: string;
}

export interface BulkReconcileToDteResult {
  paymentRecordId: string;
  paymentRecordCode: string;
  matchedTransactions: number;
  totalAmountAllocated: number;
}

/**
 * Concilia N movimientos bancarios contra 1 DTE en una sola operación.
 *
 * Uso típico: cliente paga una factura grande en varios depósitos
 * (ej. 3 transferencias de $100k para una factura de $300k). El usuario
 * selecciona los 3 mov en la tabla de Bancos y los concilia juntos
 * contra la factura.
 *
 * Validaciones:
 *   1. Todos los mov deben pertenecer al mismo tenant.
 *   2. Todos deben tener el mismo signo (todos ingresos o todos egresos).
 *      El signo determina la dirección esperada del DTE:
 *        ingresos → DTE ISSUED (cobro)
 *        egresos  → DTE RECEIVED (pago a proveedor)
 *   3. Ningún mov puede estar ya conciliado (link previo). Si lo está,
 *      se rechaza con mensaje claro: el usuario debe desconciliarlos
 *      primero.
 *   4. La suma de los montos absolutos no puede superar `amountPending`
 *      del DTE (sí puede ser igual o menor → PARTIAL).
 *
 * Implementación:
 *   - Crea UN FinancePaymentRecord por movimiento, cada uno con
 *     bankTransactionId del mov correspondiente. Más limpio que un
 *     record único compartido (cada mov tiene su propio recibo
 *     trazable y el undo individual sigue funcionando).
 *   - Cada record tiene su FinancePaymentAllocation contra el mismo DTE
 *     por su monto.
 *   - Crea un FinanceBankTransactionLink por mov (DTE_ISSUED /
 *     DTE_RECEIVED) y los marca MATCHED.
 *   - Recomputa el payment aggregate del DTE una sola vez al final.
 *
 * Retorna info del primer payment record creado (para enlazar al recibo).
 */
export async function bulkReconcileToDte(
  tenantId: string,
  userId: string | null,
  input: BulkReconcileToDteInput
): Promise<BulkReconcileToDteResult> {
  const { bankTransactionIds, dteId } = input;
  if (bankTransactionIds.length === 0) {
    throw new Error("Seleccioná al menos un movimiento");
  }
  if (bankTransactionIds.length > 50) {
    throw new Error("Máximo 50 movimientos por conciliación masiva");
  }

  const txs = await prisma.financeBankTransaction.findMany({
    where: { tenantId, id: { in: bankTransactionIds } },
    select: {
      id: true,
      amount: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
      reconciliationStatus: true,
    },
  });
  if (txs.length !== bankTransactionIds.length) {
    throw new Error(
      "Uno o más movimientos no existen o pertenecen a otro tenant"
    );
  }

  const alreadyReconciled = txs.filter(
    (t) => t.reconciliationStatus !== "UNMATCHED"
  );
  if (alreadyReconciled.length > 0) {
    throw new Error(
      `${alreadyReconciled.length} de los movimientos ya están conciliados. Desconciliá primero o quitalos de la selección.`
    );
  }

  const signs = new Set(
    txs.map((t) => (t.amount.toNumber() > 0 ? "in" : "out"))
  );
  if (signs.size > 1) {
    throw new Error(
      "No se pueden conciliar juntos ingresos y egresos. Filtrá por tipo y reintentá."
    );
  }
  const isIncome = signs.has("in");
  const expectedDirection = isIncome ? "ISSUED" : "RECEIVED";

  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: {
      id: true,
      direction: true,
      totalAmount: true,
      amountPending: true,
      siiStatus: true,
      folio: true,
      voidedByCreditNoteId: true,
      dteType: true,
    },
  });
  if (!dte) throw new Error("Factura no encontrada");
  throwIfDtesIneligibleForReconcile([dte]);
  if (dte.direction !== expectedDirection) {
    throw new Error(
      isIncome
        ? "Para conciliar ingresos elegí una factura emitida (cobro a cliente)"
        : "Para conciliar egresos elegí una factura recibida (pago a proveedor)"
    );
  }

  const totalAlloc = txs.reduce((s, t) => s + Math.abs(t.amount.toNumber()), 0);
  if (totalAlloc > dte.amountPending.toNumber() + 0.01) {
    throw new Error(
      `La suma de los movimientos ($${totalAlloc.toLocaleString("es-CL")}) supera el saldo pendiente del DTE ($${dte.amountPending.toNumber().toLocaleString("es-CL")})`
    );
  }

  let firstRecordId = "";
  let firstRecordCode = "";

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    for (const t of txs) {
      const amountAbs = Math.abs(t.amount.toNumber());
      const code = await nextPaymentRecordCode(tx2, tenantId, isIncome);
      const record = await tx2.financePaymentRecord.create({
        data: {
          tenantId,
          code,
          type: isIncome ? "COLLECTION" : "DISBURSEMENT",
          date: t.transactionDate,
          amount: new Decimal(amountAbs),
          paymentMethod: "TRANSFER",
          bankAccountId: t.bankAccountId,
          bankTransactionId: t.id,
          transferReference: t.reference ?? null,
          notes: `Conciliación masiva N→1 · ${t.description}`.slice(0, 500),
          status: "CONFIRMED",
          createdBy: userId ?? "system",
        },
      });
      if (!firstRecordId) {
        firstRecordId = record.id;
        firstRecordCode = record.code;
      }
      await tx2.financePaymentAllocation.create({
        data: {
          paymentId: record.id,
          dteId: dte.id,
          amount: new Decimal(amountAbs),
        },
      });
      await tx2.financeBankTransactionLink.create({
        data: {
          tenantId,
          bankTransactionId: t.id,
          targetType: isIncome ? "DTE_ISSUED" : "DTE_RECEIVED",
          targetId: dte.id,
          amount: new Decimal(amountAbs),
          accountPlanId: null,
          note: `Conciliación masiva N→1`,
          matchSource: "DTE",
          createdById: userId ?? null,
        },
      });
      await tx2.financeBankTransaction.update({
        where: { id: t.id },
        data: { reconciliationStatus: "MATCHED" },
      });
    }
    const primaryTx = [...txs].sort(
      (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
    )[0];
    const bankAccForWriteOff = primaryTx
      ? await tx2.financeBankAccount.findUnique({
          where: { id: primaryTx.bankAccountId },
          select: { accountPlanId: true },
        })
      : null;
    await recomputeDtePaymentAggregate(tx2, dte.id, {
      tenantId,
      paymentDate: primaryTx?.transactionDate,
      bankAccountPlanId: bankAccForWriteOff?.accountPlanId ?? null,
      userId,
    });
  });

  // Vincular la occurrence proyectada del flujo de caja al pago, igual que
  // en bulkReconcileToDtes. Sin esto la celda del cliente sigue mostrándose
  // como por cobrar aunque el DTE esté PAID.
  const sortedTxsForOcc = [...txs].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
  );
  const primaryTxForOcc = sortedTxsForOcc[0];
  if (primaryTxForOcc) {
    try {
      const occ = await prisma.financeCashflowOccurrence.findFirst({
        where: {
          tenantId,
          dteId: dte.id,
          status: "PROJECTED",
          bankTransactionId: null,
        },
        select: { id: true },
      });
      if (occ) {
        await prisma.financeCashflowOccurrence.update({
          where: { id: occ.id },
          data: {
            bankTransactionId: primaryTxForOcc.id,
            status: "PAID",
            matchedAt: new Date(),
            matchedBy: userId ?? undefined,
            effectiveDate: primaryTxForOcc.transactionDate,
          },
        });
      }
    } catch (err) {
      console.warn(
        "[bank-tx-link] no se pudo vincular occurrence proyectada al DTE",
        dte.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    paymentRecordId: firstRecordId,
    paymentRecordCode: firstRecordCode,
    matchedTransactions: txs.length,
    totalAmountAllocated: totalAlloc,
  };
}

// ── N movs → N DTEs ──

/**
 * Asignación de una porción del lote a una entidad. Cada item debe traer
 * EXACTAMENTE uno de `dteId` o `factoringOperationId`:
 *   - `dteId`: el monto se aplica al pendiente de la factura. Genera
 *     FinancePaymentAllocation + actualiza paymentStatus del DTE.
 *   - `factoringOperationId`: el monto se aplica al depósito esperado de
 *     la cesión. NO crea PaymentAllocation (el módulo factoring trackea
 *     el pago vía `fundedAt`/`status`). Si la cesión está en estado
 *     APPROVED transiciona a FUNDED. Si está en otro estado solo se
 *     setea `fundedAt` sin tocar el status.
 *
 * La merma típica de factoring (banco < bruto cedido) se modela vía
 * `differenceAllocation` con `direction: "shortfall"` y prorratea sobre
 * las líneas del DTE asociado a la cesión.
 */
export interface BulkAllocationInput {
  dteId?: string;
  factoringOperationId?: string;
  amount: number;
}

export interface BulkReconcileToDtesInput {
  bankTransactionIds: string[];
  /**
   * Asignaciones del lote. La suma debe ser ≈ sum(movs) — a menos que se
   * incluya `differenceAllocation` que absorba la diferencia.
   * El reparto a nivel de cada mov se hace proporcionalmente al peso de
   * cada allocation en el total.
   *
   * Cada item es DTE o factoring (XOR). Ver `BulkAllocationInput`.
   */
  allocations: Array<BulkAllocationInput>;
  /**
   * Diferencia opcional para cuadrar el lote (típicamente comisión de
   * factoring). Se crea un FinanceBankTransactionLink EXPENSE/INCOME por
   * cada movimiento con la cuenta elegida, prorrateado por peso del mov.
   *
   * Cuando `prorateAcrossDteLines=true`, el asiento contable se genera
   * desglosando la línea de diferencia por los `accountId` (centros de
   * costo) de las líneas de las facturas seleccionadas, ponderado por
   * subtotal de línea × asignación de factura. Si una factura no tiene
   * `accountId` en sus líneas, su porción cae en la cuenta elegida sin
   * sub-detalle.
   *
   * `direction`:
   *   - "surplus" (default, retrocompat): banco > sum(allocations); la
   *     diferencia es ingreso/gasto extra que el banco trajo además.
   *     Validación: totalAlloc + diffAmount ≈ totalMovs.
   *   - "shortfall": sum(allocations) > banco; el usuario asigna a las
   *     facturas su valor bruto (queda PAID) y la diferencia es un
   *     COSTO contable (factoring, retención, descuento). Validación:
   *     totalAlloc − diffAmount ≈ totalMovs. El link de diferencia
   *     usa targetType EXPENSE en ingresos (es costo) e INCOME en
   *     egresos (es descuento recibido).
   */
  differenceAllocation?: {
    accountPlanId: string;
    amount: number;
    label?: string | null;
    prorateAcrossDteLines?: boolean;
    direction?: "surplus" | "shortfall";
  };
}

export interface BulkReconcileToDtesResult {
  paymentRecordCodes: string[];
  matchedTransactions: number;
  affectedDtes: number;
  totalAmountAllocated: number;
  /** Monto de la diferencia absorbida por cuenta contable (0 si no hubo). */
  differenceAmount: number;
}

/**
 * Concilia N movimientos bancarios contra M DTEs en una operación atómica.
 *
 * Caso de uso típico (factoring):
 *   - El banco deposita $12.7M (1 mov, neto post-comisión).
 *   - Cubre 3 facturas cedidas (3 DTEs, brutas).
 *   - El usuario reparte el neto entre las 3 facturas según un criterio
 *     (proporcional a `amountPending` o manual).
 *
 * Por cada mov: 1 PaymentRecord con N PaymentAllocations (1 por DTE,
 * monto = movAmount × share[dte]). N bank-tx-links por mov (1 por DTE).
 *
 * Validaciones:
 *   - mismo tenant; mismo signo; ningún mov ya conciliado.
 *   - cada allocation.amount > 0 y ≤ amountPending de su DTE.
 *   - |sum(allocations) − sum(movs)| ≤ $1 (tolerancia de redondeo).
 *   - dirección consistente (ingresos → DTE ISSUED; egresos → DTE RECEIVED).
 */
export async function bulkReconcileToDtes(
  tenantId: string,
  userId: string | null,
  input: BulkReconcileToDtesInput
): Promise<BulkReconcileToDtesResult> {
  const { bankTransactionIds, allocations, differenceAllocation } = input;
  if (bankTransactionIds.length === 0) {
    throw new Error("Seleccioná al menos un movimiento");
  }
  if (bankTransactionIds.length > 50) {
    throw new Error("Máximo 50 movimientos por conciliación masiva");
  }
  if (allocations.length === 0) {
    throw new Error("Seleccioná al menos una factura");
  }
  if (allocations.length > 20) {
    throw new Error("Máximo 20 facturas por conciliación masiva");
  }

  // Validación XOR por allocation: exactamente uno de dteId/factoringOperationId.
  // Lo corremos antes de cualquier query DB para que el cliente reciba
  // feedback rápido si el body está mal formado.
  for (const a of allocations) {
    const hasDte = !!a.dteId;
    const hasFact = !!a.factoringOperationId;
    if (hasDte === hasFact) {
      throw new Error(
        "Cada asignación debe traer dteId o factoringOperationId, no ambos ni ninguno.",
      );
    }
    if (!Number.isFinite(a.amount) || a.amount <= 0) {
      throw new Error("Cada asignación debe ser > 0");
    }
  }

  const txs = await prisma.financeBankTransaction.findMany({
    where: { tenantId, id: { in: bankTransactionIds } },
    select: {
      id: true,
      amount: true,
      bankAccountId: true,
      transactionDate: true,
      description: true,
      reference: true,
      reconciliationStatus: true,
    },
  });
  if (txs.length !== bankTransactionIds.length) {
    throw new Error(
      "Uno o más movimientos no existen o pertenecen a otro tenant"
    );
  }
  const alreadyReconciled = txs.filter(
    (t) => t.reconciliationStatus !== "UNMATCHED"
  );
  if (alreadyReconciled.length > 0) {
    throw new Error(
      `${alreadyReconciled.length} de los movimientos ya están conciliados.`
    );
  }
  const signs = new Set(
    txs.map((t) => (t.amount.toNumber() > 0 ? "in" : "out"))
  );
  if (signs.size > 1) {
    throw new Error(
      "No se pueden conciliar juntos ingresos y egresos."
    );
  }
  const isIncome = signs.has("in");
  const expectedDirection = isIncome ? "ISSUED" : "RECEIVED";

  // Particionamos para procesar cada tipo por separado. El servicio
  // soporta lotes mixtos (DTEs + cesiones) en un mismo mov.
  const dteAllocs = allocations.filter(
    (a): a is BulkAllocationInput & { dteId: string } => !!a.dteId,
  );
  const factoringAllocs = allocations.filter(
    (a): a is BulkAllocationInput & { factoringOperationId: string } =>
      !!a.factoringOperationId,
  );

  // Factoring sólo aplica en ingresos (depósito del cesionario al tenant).
  if (factoringAllocs.length > 0 && !isIncome) {
    throw new Error(
      "Las cesiones a factoring sólo se concilian contra ingresos.",
    );
  }

  const dteIds = dteAllocs.map((a) => a.dteId);
  const dtes =
    dteIds.length > 0
      ? await prisma.financeDte.findMany({
          where: { tenantId, id: { in: dteIds } },
          select: {
            id: true,
            direction: true,
            totalAmount: true,
            amountPending: true,
            siiStatus: true,
            folio: true,
            voidedByCreditNoteId: true,
            dteType: true,
          },
        })
      : [];
  if (dtes.length !== dteIds.length) {
    throw new Error("Una o más facturas no existen o pertenecen a otro tenant");
  }
  throwIfDtesIneligibleForReconcile(dtes);
  for (const d of dtes) {
    if (d.direction !== expectedDirection) {
      throw new Error(
        isIncome
          ? "Para ingresos elegí facturas emitidas (cobro a cliente)"
          : "Para egresos elegí facturas recibidas (pago a proveedor)"
      );
    }
  }
  const dteById = new Map(dtes.map((d) => [d.id, d]));
  for (const a of dteAllocs) {
    const d = dteById.get(a.dteId)!;
    if (a.amount > d.amountPending.toNumber() + 0.01) {
      throw new Error(
        `La asignación supera el saldo pendiente de la factura ${a.dteId}`
      );
    }
  }

  // Validamos cesiones: existencia, tenant, estado compatible, y resolvemos
  // el dteId asociado para el prorrateo de líneas y para el adapter al
  // generador de asiento contable de la diferencia.
  const factoringIds = factoringAllocs.map((a) => a.factoringOperationId);
  const factoringOps =
    factoringIds.length > 0
      ? await prisma.financeFactoringOperation.findMany({
          where: { tenantId, id: { in: factoringIds } },
          select: {
            id: true,
            status: true,
            dteId: true,
            invoiceAmount: true,
          },
        })
      : [];
  if (factoringOps.length !== factoringIds.length) {
    throw new Error(
      "Una o más cesiones a factoring no existen o pertenecen a otro tenant",
    );
  }
  for (const op of factoringOps) {
    if (op.status === "CANCELLED" || op.status === "CLOSED") {
      throw new Error(
        `La cesión ${op.id} está ${op.status} y no se puede conciliar.`,
      );
    }
  }
  const factoringById = new Map(factoringOps.map((op) => [op.id, op]));

  const totalMovs = txs.reduce((s, t) => s + Math.abs(t.amount.toNumber()), 0);
  const totalAlloc = allocations.reduce((s, a) => s + a.amount, 0);
  const diffAmount = differenceAllocation
    ? Math.max(0, differenceAllocation.amount)
    : 0;
  const diffDirection: "surplus" | "shortfall" =
    differenceAllocation?.direction ?? "surplus";
  // Surplus: banco > facturas → totalAlloc + diff = totalMovs.
  // Shortfall: facturas > banco → totalAlloc − diff = totalMovs.
  const signedDiff = diffDirection === "shortfall" ? -diffAmount : diffAmount;
  if (Math.abs(totalAlloc + signedDiff - totalMovs) > 1) {
    if (diffAmount > 0) {
      const expected = totalAlloc + signedDiff;
      throw new Error(
        diffDirection === "shortfall"
          ? `Suma de facturas − diferencia ($${expected.toLocaleString("es-CL")}) no coincide con el total de los movimientos ($${totalMovs.toLocaleString("es-CL")}).`
          : `Suma de facturas + diferencia ($${expected.toLocaleString("es-CL")}) no coincide con el total de los movimientos ($${totalMovs.toLocaleString("es-CL")}).`,
      );
    }
    throw new Error(
      `La suma de allocations ($${totalAlloc.toLocaleString("es-CL")}) no coincide con el total de los movimientos ($${totalMovs.toLocaleString("es-CL")}).`,
    );
  }

  // Si hay diferencia, validamos que la cuenta contable elegida exista y
  // pertenezca al tenant.
  let diffAccount: { id: string; type: string | null; name: string } | null =
    null;
  if (differenceAllocation && diffAmount > 0) {
    diffAccount = await prisma.financeAccountPlan.findFirst({
      where: {
        tenantId,
        id: differenceAllocation.accountPlanId,
      },
      select: { id: true, type: true, name: true },
    });
    if (!diffAccount) {
      throw new Error("Cuenta contable para la diferencia no encontrada");
    }
  }

  // Si vamos a prorratear a centros de costo, pre-cargamos las líneas de
  // los DTE seleccionados con su accountId y subtotal. Para allocations
  // factoring usamos las líneas del DTE asociado a la cesión.
  let dteLinesByDte: Map<string, Array<{ accountId: string | null; subtotal: number }>> =
    new Map();
  // dteId equivalente para cada allocation, usado por el generador del
  // asiento contable de la diferencia (acepta DTE-keyed allocations).
  // Para DTE allocs es a.dteId; para factoring allocs es el dteId de la
  // cesión.
  const allocationEquivalentDteId = new Map<BulkAllocationInput, string>();
  for (const a of dteAllocs) {
    allocationEquivalentDteId.set(a, a.dteId);
  }
  for (const a of factoringAllocs) {
    const op = factoringById.get(a.factoringOperationId)!;
    allocationEquivalentDteId.set(a, op.dteId);
  }
  if (
    differenceAllocation &&
    differenceAllocation.prorateAcrossDteLines &&
    diffAmount > 0
  ) {
    const effectiveDteIds = Array.from(
      new Set(Array.from(allocationEquivalentDteId.values())),
    );
    // `netAmount` representa el subtotal de la línea (post-descuento,
    // pre-IVA) y es el campo correcto para ponderar el peso de cada
    // línea dentro de la factura para distribuir costos.
    const lines = await prisma.financeDteLine.findMany({
      where: { dteId: { in: effectiveDteIds } },
      select: { dteId: true, accountId: true, netAmount: true },
    });
    dteLinesByDte = lines.reduce((map, l) => {
      const arr = map.get(l.dteId) ?? [];
      arr.push({
        accountId: l.accountId ?? null,
        subtotal: l.netAmount ? Number(l.netAmount) : 0,
      });
      map.set(l.dteId, arr);
      return map;
    }, new Map<string, Array<{ accountId: string | null; subtotal: number }>>());
  }

  const paymentRecordCodes: string[] = [];

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    for (const t of txs) {
      const movAmount = Math.abs(t.amount.toNumber());
      // El share base proporcional de este mov en el total (cubre tanto
      // allocations DTE como diferencia). Garantiza que cada mov reparta
      // exactamente movAmount entre todos los targets.
      const movShare = totalMovs > 0 ? movAmount / totalMovs : 0;
      const code = await nextPaymentRecordCode(tx2, tenantId, isIncome);
      // Pieces en enteros CLP: CLP no usa decimales, y trabajar con enteros
      // reduce los residuos de redondeo a max $1 por mov en lugar de hasta
      // $0.01 por mov (que acumulado en N movs llegaba a dejar la factura
      // PARTIAL por unos centavos). recomputeDtePaymentAggregate tiene
      // además una tolerancia de $5 para coverage.
      const movDtePortion = Math.round(movShare * totalAlloc);
      const record = await tx2.financePaymentRecord.create({
        data: {
          tenantId,
          code,
          type: isIncome ? "COLLECTION" : "DISBURSEMENT",
          date: t.transactionDate,
          amount: new Decimal(movDtePortion),
          paymentMethod: "TRANSFER",
          bankAccountId: t.bankAccountId,
          bankTransactionId: t.id,
          transferReference: t.reference ?? null,
          notes: `Conciliación masiva N→N · ${t.description}`.slice(0, 500),
          status: "CONFIRMED",
          createdBy: userId ?? "system",
        },
      });
      paymentRecordCodes.push(record.code);

      // Reparto proporcional con redondeo en la última allocation.
      // En SHORTFALL: el `linkPiece` (lo que toma el banco) es prorrateado
      // sobre `movAmount` (suma por mov = movAmount), mientras que el
      // `paymentPiece` (lo que se aplica al bruto de la factura) es
      // prorrateado sobre `movDtePortion` (suma por DTE = a.amount, la
      // factura queda PAID). El gap entre ambos es el costo absorbido
      // contablemente más abajo.
      // En SURPLUS: ambos coinciden (movLinkPool = movDtePortion).
      const movLinkPool =
        diffDirection === "shortfall" ? movAmount : movDtePortion;
      let assignedToPayments = 0;
      let assignedToLinks = 0;
      for (let i = 0; i < allocations.length; i++) {
        const a = allocations[i];
        const isLast = i === allocations.length - 1;
        const share = totalAlloc > 0 ? a.amount / totalAlloc : 0;
        const paymentPiece = isLast
          ? movDtePortion - assignedToPayments
          : Math.round(movDtePortion * share);
        assignedToPayments += paymentPiece;
        const linkPiece = isLast
          ? movLinkPool - assignedToLinks
          : Math.round(movLinkPool * share);
        assignedToLinks += linkPiece;

        if (a.dteId) {
          await tx2.financePaymentAllocation.create({
            data: {
              paymentId: record.id,
              dteId: a.dteId,
              amount: new Decimal(paymentPiece),
            },
          });
          await tx2.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: t.id,
              targetType: isIncome ? "DTE_ISSUED" : "DTE_RECEIVED",
              targetId: a.dteId,
              amount: new Decimal(linkPiece),
              accountPlanId: null,
              note: `Conciliación masiva N→N`,
              matchSource: "DTE",
              createdById: userId ?? null,
            },
          });
        } else if (a.factoringOperationId) {
          // Factoring: NO se crea PaymentAllocation porque el módulo
          // factoring trackea el cobro vía status/fundedAt (no por suma
          // de allocations). Solo creamos el link bancario contra la
          // cesión; la transición de estado APPROVED→FUNDED ocurre
          // post-transacción más abajo.
          await tx2.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: t.id,
              targetType: "FACTORING_OPERATION",
              targetId: a.factoringOperationId,
              amount: new Decimal(linkPiece),
              accountPlanId: null,
              note: `Conciliación masiva N→N · cesión factoring`,
              matchSource: "MANUAL",
              createdById: userId ?? null,
            },
          });
        }
      }

      // Link EXPENSE/INCOME del banco para la diferencia: SOLO en SURPLUS.
      // En SURPLUS el banco aportó "de más" → ese sobrante se atribuye a
      // la cuenta elegida (comisión recibida / gasto extra) con su link
      // bancario. En SHORTFALL el banco ya está saturado en DTE-links
      // (sum links = bankAmount); el costo se refleja solo en el asiento
      // contable más abajo.
      if (
        differenceAllocation &&
        diffAmount > 0 &&
        diffAccount &&
        diffDirection === "surplus"
      ) {
        const movDiffPortion = Math.round(movShare * diffAmount);
        if (movDiffPortion > 0) {
          await tx2.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: t.id,
              targetType: isIncome ? "INCOME" : "EXPENSE",
              targetId: null,
              amount: new Decimal(movDiffPortion),
              accountPlanId: diffAccount.id,
              note:
                differenceAllocation.label?.trim() ||
                `Diferencia conciliación (${isIncome ? "ingreso" : "gasto"})`,
              matchSource: "MANUAL",
              createdById: userId ?? null,
            },
          });
        }
      }

      await tx2.financeBankTransaction.update({
        where: { id: t.id },
        data: { reconciliationStatus: "MATCHED" },
      });
    }
    // Recompute solo para DTEs: las cesiones no tienen amountPaid
    // derivado de allocations, se manejan vía status/fundedAt fuera de
    // la transacción.
    const primaryTxForWriteOff = [...txs].sort(
      (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
    )[0];
    const bankAccForWriteOff = primaryTxForWriteOff
      ? await tx2.financeBankAccount.findUnique({
          where: { id: primaryTxForWriteOff.bankAccountId },
          select: { accountPlanId: true },
        })
      : null;
    for (const a of dteAllocs) {
      await recomputeDtePaymentAggregate(tx2, a.dteId, {
        tenantId,
        paymentDate: primaryTxForWriteOff?.transactionDate,
        bankAccountPlanId: bankAccForWriteOff?.accountPlanId ?? null,
        userId,
      });
    }
    // Cesiones: marcar `fundedAt` con la fecha del primer mov del lote
    // (los lotes con varios movs son típicos de batches factoring). La
    // transición de estado a FUNDED sólo procede desde APPROVED — si la
    // cesión está en otro estado (SIMULATED/SUBMITTED), dejamos
    // `fundedAt` para trazabilidad pero NO cambiamos el status (puede
    // estar pendiente de aceptación SII).
    if (factoringAllocs.length > 0) {
      const sortedTxsForFunding = [...txs].sort(
        (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
      );
      const fundingDate = sortedTxsForFunding[0].transactionDate;
      for (const a of factoringAllocs) {
        const op = factoringById.get(a.factoringOperationId)!;
        await tx2.financeFactoringOperation.update({
          where: { id: op.id },
          data: {
            fundedAt: fundingDate,
            ...(op.status === "APPROVED" ? { status: "FUNDED" as const } : {}),
          },
        });
      }
    }
  });

  // Asiento contable post-transacción para la PORCIÓN DE DIFERENCIA:
  // las allocations DTE ya tienen su contabilidad propia (vía DTE → asiento
  // al emitir). Acá lo único que requiere asiento es la diferencia
  // (comisión / descuento / retención), desglosada opcionalmente por
  // centro de costo de las líneas de cada factura.
  if (
    userId &&
    differenceAllocation &&
    diffAmount > 0 &&
    diffAccount
  ) {
    // El generador del asiento sólo conoce DTE allocations; mapeamos
    // factoring → dteId asociado de la cesión, manteniendo el monto. Eso
    // permite prorratear la merma sobre las líneas del DTE original
    // independiente del tipo de allocation.
    const dteShapedAllocations = allocations.map((a) => ({
      dteId: allocationEquivalentDteId.get(a)!,
      amount: a.amount,
    }));
    await generateDifferenceJournalEntry(tenantId, userId, {
      txs,
      isIncome,
      diffAmount,
      diffAccountId: diffAccount.id,
      diffLabel: differenceAllocation.label ?? null,
      prorateAcrossDteLines: !!differenceAllocation.prorateAcrossDteLines,
      allocations: dteShapedAllocations,
      dteLinesByDte,
      direction: diffDirection,
    });
  }

  // En SHORTFALL: además del asiento contable, exponemos el costo en el
  // flujo de caja creando UN solo FinanceBankTransactionLink EXPENSE
  // (o INCOME para egresos shortfall) en el primer mov del lote. La
  // proyección lo lee como "link huérfano" y lo suma a la categoría
  // mapeada a la cuenta diff. Esto evita crear items proyectados
  // virtuales (que el usuario tendría que gestionar en /configuracion).
  //
  // El link rompe el invariante "sum links = bankAmount" para ese mov;
  // setTransactionLinks excluye links EXPENSE/INCOME del cálculo cuando
  // hay DTE_* en el mismo mov (los DTE-links ya cubren el banco).
  if (
    differenceAllocation &&
    diffAmount > 0 &&
    diffAccount &&
    diffDirection === "shortfall"
  ) {
    const sortedTxs = [...txs].sort(
      (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
    );
    const repTx = sortedTxs[0];
    const linkAmount = Math.round(diffAmount);
    if (linkAmount > 0) {
      try {
        // Idempotencia: si ya existe link EXPENSE/INCOME para ese mov con
        // la misma cuenta y monto, no duplicamos.
        const existing = await prisma.financeBankTransactionLink.findFirst({
          where: {
            tenantId,
            bankTransactionId: repTx.id,
            accountPlanId: diffAccount.id,
            targetType: isIncome ? "EXPENSE" : "INCOME",
          },
          select: { id: true },
        });
        if (!existing) {
          await prisma.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: repTx.id,
              // shortfall + ingreso → costo (EXPENSE en signo contable)
              // shortfall + egreso  → descuento (INCOME en signo contable)
              targetType: isIncome ? "EXPENSE" : "INCOME",
              targetId: null,
              amount: new Decimal(linkAmount),
              accountPlanId: diffAccount.id,
              note:
                differenceAllocation.label?.trim() ||
                `Diferencia conciliación shortfall (${txs.length} mov${txs.length === 1 ? "" : "s"})`,
              matchSource: "MANUAL",
              createdById: userId ?? null,
            },
          });
        }
      } catch (err) {
        console.warn(
          "[bank-tx-link] shortfall: no se pudo crear link EXPENSE/INCOME:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Vincular occurrences proyectadas del flujo de caja al pago. Sin esto,
  // la celda del cliente sigue mostrándose como por cobrar aunque el DTE
  // esté PAID, porque el matcher account-driven solo empareja por categoría
  // y se confunde en N→N (un DTE con N bank txs queda con N−1 links
  // huérfanos). Acá usamos el vínculo directo dteId → occurrence, que es
  // determinístico cuando el DTE fue emitido desde una cuota materializada.
  const sortedTxs = [...txs].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
  );
  const primaryTx = sortedTxs[0];
  if (primaryTx) {
    for (const a of dteAllocs) {
      try {
        const occ = await prisma.financeCashflowOccurrence.findFirst({
          where: {
            tenantId,
            dteId: a.dteId,
            status: "PROJECTED",
            bankTransactionId: null,
          },
          select: { id: true },
        });
        if (occ) {
          await prisma.financeCashflowOccurrence.update({
            where: { id: occ.id },
            data: {
              bankTransactionId: primaryTx.id,
              status: "PAID",
              matchedAt: new Date(),
              matchedBy: userId ?? undefined,
              effectiveDate: primaryTx.transactionDate,
            },
          });
        }
      } catch (err) {
        console.warn(
          "[bank-tx-link] no se pudo vincular occurrence proyectada al DTE",
          a.dteId,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return {
    paymentRecordCodes,
    matchedTransactions: txs.length,
    affectedDtes: dteAllocs.length + factoringAllocs.length,
    totalAmountAllocated: totalMovs,
    differenceAmount: diffAmount,
  };
}

/**
 * Genera el asiento contable de la PORCIÓN DE DIFERENCIA en una conciliación
 * masiva N → N con `differenceAllocation`. Las allocations DTE no se
 * contabilizan acá: el DTE ya generó su asiento al emitirse y el pago se
 * refleja vía `FinancePaymentRecord`.
 *
 * Cuando `prorateAcrossDteLines=true`, el debe (egreso) o haber (ingreso)
 * se desglosa en N sub-líneas con la MISMA cuenta `diffAccountId`, una por
 * cada `FinanceDteLine.accountId` (centro de costo) de las facturas
 * seleccionadas. Cada sub-línea tiene la descripción "diffLabel · centro X"
 * para que en el mayor contable la diferencia quede trazada por centro.
 *
 * Si una factura no tiene `accountId` en sus líneas, su porción cae
 * íntegra en una línea con la cuenta elegida sin sub-detalle.
 */
async function generateDifferenceJournalEntry(
  tenantId: string,
  userId: string,
  params: {
    txs: Array<{
      id: string;
      bankAccountId: string;
      transactionDate: Date;
      description: string;
      reference: string | null;
      amount: Decimal;
    }>;
    isIncome: boolean;
    diffAmount: number;
    diffAccountId: string;
    diffLabel: string | null;
    prorateAcrossDteLines: boolean;
    allocations: Array<{ dteId: string; amount: number }>;
    dteLinesByDte: Map<
      string,
      Array<{ accountId: string | null; subtotal: number }>
    >;
    direction: "surplus" | "shortfall";
  },
): Promise<string | null> {
  const {
    txs,
    isIncome,
    diffAmount,
    diffAccountId,
    diffLabel,
    prorateAcrossDteLines,
    allocations,
    dteLinesByDte,
    direction,
  } = params;
  if (diffAmount <= 0) return null;
  // Side del asiento para la(s) línea(s) de la cuenta diff:
  //   surplus  + ingreso → ingreso extra (HABER cuenta diff, DEBE banco)
  //   surplus  + egreso  → gasto extra   (DEBE cuenta diff, HABER banco)
  //   shortfall+ ingreso → costo factor. (DEBE cuenta diff, HABER banco)
  //   shortfall+ egreso  → descuento     (HABER cuenta diff, DEBE banco)
  // Es decir, shortfall invierte el lado respecto a surplus.
  const diffOnCredit =
    direction === "shortfall" ? !isIncome : isIncome;

  // Necesitamos la cuenta contable del banco para la contrapartida.
  const refTx = txs[0];
  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: refTx.bankAccountId, tenantId },
    select: { accountPlanId: true, bankName: true, accountNumber: true },
  });
  if (!bankAccount?.accountPlanId) {
    // Sin cuenta bancaria vinculada no podemos balancear el asiento — la
    // conciliación se hizo igual, pero no creamos asiento. Log + skip.
    console.warn(
      "[bank-tx-link] No se generó asiento de diferencia: cuenta bancaria sin accountPlanId",
    );
    return null;
  }

  // Acumulamos las líneas del lado gasto/ingreso por accountId. Si no hay
  // prorrateo o no se logra desglosar, todo cae en `diffAccountId`.
  const lines: { accountId: string; description: string; debit: number; credit: number }[] =
    [];

  if (prorateAcrossDteLines) {
    // Para cada factura: porción = (a.amount / totalAlloc) × diffAmount.
    // Esa porción se reparte entre las líneas de la factura ponderado por
    // (line.lineTotal / sum(line.lineTotal)). Las líneas sin accountId
    // colapsan a `diffAccountId`. Las líneas con accountId se acumulan
    // por accountId para minimizar el número de líneas del asiento.
    const totalAlloc = allocations.reduce((s, a) => s + a.amount, 0);
    const byAccount = new Map<string, number>();
    let unallocated = 0;
    for (const a of allocations) {
      const factShare = totalAlloc > 0 ? a.amount / totalAlloc : 0;
      const factPortion = factShare * diffAmount;
      const linesOfDte = dteLinesByDte.get(a.dteId) ?? [];
      const totalLineSubtotal = linesOfDte.reduce(
        (s, l) => s + (l.subtotal > 0 ? l.subtotal : 0),
        0,
      );
      if (linesOfDte.length === 0 || totalLineSubtotal <= 0) {
        unallocated += factPortion;
        continue;
      }
      for (const l of linesOfDte) {
        const lineShare = l.subtotal > 0 ? l.subtotal / totalLineSubtotal : 0;
        const piece = factPortion * lineShare;
        if (l.accountId) {
          byAccount.set(
            l.accountId,
            (byAccount.get(l.accountId) ?? 0) + piece,
          );
        } else {
          unallocated += piece;
        }
      }
    }

    // Convertimos a líneas con redondeo. Para evitar que el redondeo
    // descuadre el asiento, ajustamos la última línea con el residuo.
    const entries: { accountId: string; amount: number }[] = [];
    for (const [accountId, amount] of byAccount.entries()) {
      const rounded = Math.round(amount);
      if (rounded > 0) entries.push({ accountId, amount: rounded });
    }
    if (unallocated > 0) {
      const rounded = Math.round(unallocated);
      if (rounded > 0)
        entries.push({ accountId: diffAccountId, amount: rounded });
    }
    const entriesSum = entries.reduce((s, e) => s + e.amount, 0);
    const diffRoundedTotal = Math.round(diffAmount);
    const residue = diffRoundedTotal - entriesSum;
    if (entries.length > 0 && residue !== 0) {
      entries[entries.length - 1].amount += residue;
    }

    for (const e of entries) {
      const desc = diffLabel ?? "Diferencia conciliación";
      if (diffOnCredit) {
        lines.push({
          accountId: e.accountId,
          description: desc,
          debit: 0,
          credit: e.amount,
        });
      } else {
        lines.push({
          accountId: e.accountId,
          description: desc,
          debit: e.amount,
          credit: 0,
        });
      }
    }
  }

  // Fallback / sin prorrateo: 1 sola línea con la cuenta elegida por el
  // monto completo de la diferencia.
  if (lines.length === 0) {
    const desc = diffLabel ?? "Diferencia conciliación";
    const total = Math.round(diffAmount);
    if (diffOnCredit) {
      lines.push({
        accountId: diffAccountId,
        description: desc,
        debit: 0,
        credit: total,
      });
    } else {
      lines.push({
        accountId: diffAccountId,
        description: desc,
        debit: total,
        credit: 0,
      });
    }
  }

  // Contrapartida banco: 1 sola línea por el total de la diferencia,
  // opuesta al lado de la cuenta diff.
  const total = lines.reduce((s, l) => s + l.debit + l.credit, 0);
  if (diffOnCredit) {
    lines.push({
      accountId: bankAccount.accountPlanId,
      description: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
      debit: total,
      credit: 0,
    });
  } else {
    lines.push({
      accountId: bankAccount.accountPlanId,
      description: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
      debit: 0,
      credit: total,
    });
  }

  const dateStr = refTx.transactionDate.toISOString().slice(0, 10);
  try {
    const entry = await createManualEntry(tenantId, userId, {
      date: dateStr,
      description: `Diferencia conciliación masiva: ${diffLabel ?? refTx.description}`.slice(
        0,
        200,
      ),
      reference: refTx.reference ?? undefined,
      sourceType: "RECONCILIATION",
      sourceId: refTx.id,
      lines,
    });
    return entry.id;
  } catch (err) {
    // No frenamos la conciliación si el asiento falla (período cerrado,
    // validación contable, etc). El usuario verá la conciliación lista
    // pero podrá generar el asiento de la diferencia manualmente después.
    console.error(
      "[bank-tx-link] No se generó asiento de diferencia:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Confirma una sugerencia generada por una regla auto-match: convierte la
 * propuesta guardada en `suggestedRuleId` + `suggestedAccountPlanId` en un
 * link real y deja la tx MATCHED. Idempotente: si ya está MATCHED o no hay
 * sugerencia, no hace nada.
 */
export async function confirmSuggestion(
  tenantId: string,
  bankTxId: string,
  userId: string | null
): Promise<{ confirmed: boolean }> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: {
      id: true,
      amount: true,
      reconciliationStatus: true,
      suggestedRuleId: true,
      suggestedAccountPlanId: true,
    },
  });
  if (!tx) throw new Error("Movimiento no encontrado");
  if (tx.reconciliationStatus !== "UNMATCHED") return { confirmed: false };
  if (!tx.suggestedAccountPlanId) return { confirmed: false };

  const isIncome = tx.amount.toNumber() > 0;
  const amountAbs = Math.abs(tx.amount.toNumber());

  // Si la sugerencia viene de una regla FLOW_ROW, persistir flow_row_id
  // (misma semántica que clasificar a fila — evita ambigüedad por accountPlanId compartido).
  let flowRowId: string | null = null;
  if (tx.suggestedRuleId) {
    const rule = await prisma.financeAutoMatchRule.findFirst({
      where: { id: tx.suggestedRuleId, tenantId },
      select: { action: true },
    });
    const action = rule?.action as { kind?: string; flowRowId?: string } | null;
    if (action?.kind === "FLOW_ROW" && typeof action.flowRowId === "string") {
      const row = await prisma.financeFlowRow.findFirst({
        where: { id: action.flowRowId, tenantId, archivedAt: null },
        select: { id: true },
      });
      flowRowId = row?.id ?? null;
    }
  }

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    await tx2.financeBankTransactionLink.create({
      data: {
        tenantId,
        bankTransactionId: bankTxId,
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: new Decimal(amountAbs),
        accountPlanId: tx.suggestedAccountPlanId!,
        flowRowId,
        note: "Auto-match autorizado por regla",
        matchSource: tx.suggestedRuleId ? "RULE" : "INFERRED",
        matchedByRuleId: tx.suggestedRuleId ?? null,
        createdById: userId ?? null,
      },
    });
    await tx2.financeBankTransaction.update({
      where: { id: bankTxId },
      data: {
        reconciliationStatus: "MATCHED",
        suggestedRuleId: null,
        suggestedAccountPlanId: null,
      },
    });
    if (tx.suggestedRuleId) {
      await tx2.financeAutoMatchRule.update({
        where: { id: tx.suggestedRuleId },
        data: {
          timesMatched: { increment: 1 },
          lastMatchedAt: new Date(),
        },
      });
    }
  });

  // Asiento contable: para que la cuenta de gasto/ingreso impacte el
  // estado de resultados y el balance.
  if (userId) {
    const fullTx = await prisma.financeBankTransaction.findFirst({
      where: { id: bankTxId, tenantId },
      select: {
        id: true,
        bankAccountId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
      },
    });
    if (fullTx) {
      await generateJournalEntryForLinks(tenantId, userId, fullTx, [
        {
          targetType: isIncome ? "INCOME" : "EXPENSE",
          amount: new Decimal(amountAbs),
          accountPlanId: tx.suggestedAccountPlanId!,
          note: "Auto-match autorizado por regla",
        },
      ]);
    }
  }

  return { confirmed: true };
}

/**
 * Confirma TODAS las sugerencias pendientes de una cuenta (o de todas) en
 * un sólo barrido. Devuelve cuántas se autorizaron.
 *
 * Filtros opcionales para restringir el alcance:
 *   - bankAccountId: solo de una cuenta.
 *   - txIds: solo estos ids específicos (selección manual del usuario).
 */
export async function confirmAllSuggestions(
  tenantId: string,
  userId: string | null,
  filters: { bankAccountId?: string; txIds?: string[] } = {}
): Promise<{ confirmed: number }> {
  const where: Prisma.FinanceBankTransactionWhereInput = {
    tenantId,
    reconciliationStatus: "UNMATCHED",
    hiddenAt: null,
    suggestedAccountPlanId: { not: null },
  };
  if (filters.bankAccountId) where.bankAccountId = filters.bankAccountId;
  if (filters.txIds && filters.txIds.length > 0) {
    where.id = { in: filters.txIds };
  }

  const candidates = await prisma.financeBankTransaction.findMany({
    where,
    select: { id: true },
    take: 1000, // hard cap por seguridad
  });

  let confirmed = 0;
  for (const c of candidates) {
    const r = await confirmSuggestion(tenantId, c.id, userId);
    if (r.confirmed) confirmed += 1;
  }
  return { confirmed };
}

/**
 * Genera un FinanceJournalEntry contable para los links EXPENSE/INCOME
 * de una tx (gasto/ingreso manual sin DTE). Esto hace que esos
 * movimientos efectivamente IMPACTEN el estado de resultados y el
 * balance — antes quedaban fuera porque el balance solo cuenta DTEs.
 *
 * Casos:
 *   - Egreso conciliado a EXPENSE: D cuenta de gasto / H cuenta bancaria.
 *   - Ingreso conciliado a INCOME: D cuenta bancaria / H cuenta ingreso.
 *
 * Para links DTE_ISSUED/DTE_RECEIVED no se genera asiento porque el DTE
 * ya tiene el suyo (al emitirse / registrarse) y el FinancePaymentRecord
 * representa el pago. Si el split tiene una mezcla DTE + EXPENSE, solo
 * la porción EXPENSE/INCOME se contabiliza acá.
 *
 * Si la cuenta bancaria no tiene `accountPlanId` (no vinculada al plan
 * de cuentas) no se puede balancear — devuelve null sin error.
 *
 * Devuelve el id del asiento creado o null si no aplicaba.
 */
async function generateJournalEntryForLinks(
  tenantId: string,
  userId: string,
  bankTx: { id: string; bankAccountId: string; transactionDate: Date; description: string; reference: string | null; amount: Decimal },
  links: { targetType: FinanceLinkTarget; amount: Decimal; accountPlanId: string | null; note: string | null }[]
): Promise<string | null> {
  const manualLines = links.filter(
    (l) =>
      l.accountPlanId &&
      (l.targetType === "EXPENSE" || l.targetType === "INCOME")
  );
  if (manualLines.length === 0) return null;

  const bankAccount = await prisma.financeBankAccount.findFirst({
    where: { id: bankTx.bankAccountId, tenantId },
    select: { accountPlanId: true, bankName: true, accountNumber: true },
  });
  if (!bankAccount?.accountPlanId) {
    // Sin cuenta contable de banco vinculada no podemos balancear.
    return null;
  }

  const totalManualAmount = manualLines.reduce(
    (s, l) => s + l.amount.toNumber(),
    0
  );
  if (totalManualAmount <= 0) return null;

  const isIncome = bankTx.amount.toNumber() > 0;
  const dateStr = bankTx.transactionDate.toISOString().slice(0, 10);

  // Construye las líneas del asiento.
  const lines: {
    accountId: string;
    description: string;
    debit: number;
    credit: number;
  }[] = [];

  for (const l of manualLines) {
    const amt = l.amount.toNumber();
    if (isIncome) {
      // Ingreso: H cuenta de ingreso
      lines.push({
        accountId: l.accountPlanId!,
        description: l.note ?? bankTx.description,
        debit: 0,
        credit: amt,
      });
    } else {
      // Egreso: D cuenta de gasto
      lines.push({
        accountId: l.accountPlanId!,
        description: l.note ?? bankTx.description,
        debit: amt,
        credit: 0,
      });
    }
  }

  // Contrapartida banco: una sola línea por la suma.
  if (isIncome) {
    lines.push({
      accountId: bankAccount.accountPlanId,
      description: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
      debit: totalManualAmount,
      credit: 0,
    });
  } else {
    lines.push({
      accountId: bankAccount.accountPlanId,
      description: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
      debit: 0,
      credit: totalManualAmount,
    });
  }

  try {
    const entry = await createManualEntry(tenantId, userId, {
      date: dateStr,
      description: `Conciliación bancaria: ${bankTx.description}`.slice(0, 200),
      reference: bankTx.reference ?? undefined,
      sourceType: "RECONCILIATION",
      sourceId: bankTx.id,
      lines,
    });
    return entry.id;
  } catch (err) {
    // Si el período está cerrado o falla validación, no rompemos la
    // conciliación — log y seguimos. El usuario verá el link creado pero
    // sin asiento contable; podrá generarlo manualmente después.
    console.error(
      "[bank-tx-link] No se pudo generar asiento contable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Elimina todos los links de una tx, deja UNMATCHED y revierte el
 * asiento contable asociado (sourceType=RECONCILIATION + sourceId=bankTxId)
 * si existe — DRAFT se borra, POSTED se reversa con asiento espejo.
 *
 * Coherencia banco ↔ DTE: además borra el FinancePaymentRecord creado
 * por setTransactionLinks (si existía), lo que dispara el recompute del
 * paymentStatus del DTE para reflejar que el pago ya no está vigente.
 * Idempotente: si la conciliación se hizo antes del fix de coherencia y
 * no hay FinancePaymentRecord asociado, simplemente saltea.
 */
export async function clearTransactionLinks(
  tenantId: string,
  bankTxId: string
): Promise<void> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { id: true, transactionDate: true },
  });
  if (!tx) throw new Error("Movimiento no encontrado");

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    // 1. Revertir FinancePaymentRecord previo: borrar allocations,
    //    borrar el record y recordar los DTE para recompute.
    const previousPayments = await tx2.financePaymentRecord.findMany({
      where: { tenantId, bankTransactionId: bankTxId },
      select: { id: true, allocations: { select: { dteId: true } } },
    });
    const dteIdsToRecompute = new Set<string>();
    for (const pay of previousPayments) {
      for (const a of pay.allocations) dteIdsToRecompute.add(a.dteId);
    }
    if (previousPayments.length > 0) {
      const ids = previousPayments.map((p) => p.id);
      await tx2.financePaymentAllocation.deleteMany({
        where: { paymentId: { in: ids } },
      });
      await tx2.financePaymentRecord.deleteMany({
        where: { id: { in: ids } },
      });
    }

    // 2. Borrar links polymorphic.
    await tx2.financeBankTransactionLink.deleteMany({
      where: { tenantId, bankTransactionId: bankTxId },
    });

    // 2.5. Desvincular occurrences de cashflow que referenciaban este tx.
    //      Sin esto, las occurrences quedan zombi: status=PAID +
    //      bankTransactionId obsoleto. El render del flujo las muestra
    //      como "Pagada" aunque el DTE haya vuelto a UNPAID por el
    //      recompute del paso 3. Causa raíz del bug 1701.
    await tx2.financeCashflowOccurrence.updateMany({
      where: { tenantId, bankTransactionId: bankTxId },
      data: {
        bankTransactionId: null,
        matchedAt: null,
        matchedBy: null,
        status: "PROJECTED",
      },
    });

    // 3. Recomputar payment aggregate de los DTEs afectados.
    for (const dteId of Array.from(dteIdsToRecompute)) {
      await recomputeDtePaymentAggregate(tx2, dteId);
    }

    // 3b. reconciledAt: para los DTEs cuyo último link a este movimiento
    //     se acaba de borrar, si ya no tienen NINGÚN link DTE_* vivo,
    //     bajar reconciledAt a null. Si todavía está linkeado a otro mov,
    //     se preserva (otro link sigue válido).
    if (dteIdsToRecompute.size > 0) {
      const ids = Array.from(dteIdsToRecompute);
      const stillLinked = await tx2.financeBankTransactionLink.findMany({
        where: {
          tenantId,
          targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
          targetId: { in: ids },
        },
        select: { targetId: true },
      });
      const stillLinkedSet = new Set(
        stillLinked.map((l) => l.targetId).filter((x): x is string => !!x),
      );
      const toClear = ids.filter((id) => !stillLinkedSet.has(id));
      if (toClear.length > 0) {
        await tx2.financeDte.updateMany({
          where: { id: { in: toClear } },
          data: { reconciledAt: null },
        });
      }
    }

    // 4. Marcar tx como UNMATCHED.
    await tx2.financeBankTransaction.update({
      where: { id: bankTxId },
      data: { reconciliationStatus: "UNMATCHED" },
    });
  });

  // Limpiar el asiento contable asociado, si existe.
  const existingEntries = await prisma.financeJournalEntry.findMany({
    where: {
      tenantId,
      sourceType: "RECONCILIATION",
      sourceId: bankTxId,
      status: { in: ["DRAFT", "POSTED"] },
    },
    select: { id: true, status: true },
  });
  for (const e of existingEntries) {
    if (e.status === "DRAFT") {
      await prisma.financeJournalEntry.delete({ where: { id: e.id } });
    }
    // Para POSTED no auto-reversa: el contador necesita verlo. La UI
    // puede mostrar un aviso "queda asiento pendiente de reversar". En
    // una iteración futura se puede invocar reverseEntry acá.
  }
}

// ── Desconciliar DTE emitido (desde facturación) ──

export interface UnreconcileIssuedDteResult {
  allocationsRemoved: number;
  paymentsDeleted: number;
  bankLinksRemoved: number;
  bankTransactionsReset: number;
}

export interface UnreconcileIssuedDteOptions {
  /**
   * Si true, limpia links/reconciledAt/allocations pero NO recomputa
   * paymentStatus (contrato UI facturación: "sigue marcada como pagada").
   * Default false → recompute bank-aligned (UNPAID si el cobro era solo cartola).
   */
  keepPaymentStatus?: boolean;
}

/**
 * Desconcilia un DTE emitido desde facturación (`POST .../issued/[id]/unreconcile`).
 *
 * Es el inverso centrado-en-DTE de `clearTransactionLinks` (centrado-en-movimiento).
 * Deja banco + DTE consistentes:
 *   - Borra allocations y PaymentRecords huérfanos de esta conciliación.
 *   - Elimina `FinanceBankTransactionLink` DTE_ISSUED → este dteId.
 *   - Recomputa `paymentStatus` / montos (salvo `keepPaymentStatus`) vía
 *     `recomputeDtePaymentAggregate`, con el mismo orden que banca: recompute
 *     mientras `reconciledAt` aún está seteado, luego limpiar reconciledAt.
 *   - Movimientos que quedan sin links → UNMATCHED + reset de cashflow occurrences.
 *
 * **Modo "mantener pagada":** `keepPaymentStatus: true` (lo envía la UI de
 * DTEs emitidos). Preserva PAID/amountPaid; solo rompe vínculo bancario.
 */
export async function unreconcileIssuedDte(
  tenantId: string,
  dteId: string,
  opts: UnreconcileIssuedDteOptions = {},
): Promise<UnreconcileIssuedDteResult> {
  const keepPaymentStatus = opts.keepPaymentStatus === true;
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
    select: { id: true },
  });
  if (!dte) throw new Error("DTE no encontrado");

  const bankLinks = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, targetType: "DTE_ISSUED", targetId: dteId },
    select: { bankTransactionId: true },
  });
  const allocationCount = await prisma.financePaymentAllocation.count({
    where: { dteId },
  });
  if (bankLinks.length === 0 && allocationCount === 0) {
    return {
      allocationsRemoved: 0,
      paymentsDeleted: 0,
      bankLinksRemoved: 0,
      bankTransactionsReset: 0,
    };
  }

  const affectedBankTxIds = Array.from(
    new Set(bankLinks.map((l) => l.bankTransactionId)),
  );

  return prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    const allocations = await tx2.financePaymentAllocation.findMany({
      where: { dteId },
      select: { id: true, paymentId: true },
    });

    if (allocations.length > 0) {
      await tx2.financePaymentAllocation.deleteMany({
        where: { id: { in: allocations.map((a) => a.id) } },
      });
    }

    const paymentIds = Array.from(new Set(allocations.map((a) => a.paymentId)));
    let paymentsDeleted = 0;
    for (const pid of paymentIds) {
      const remaining = await tx2.financePaymentAllocation.count({
        where: { paymentId: pid },
      });
      if (remaining === 0) {
        await tx2.financePaymentRecord.delete({ where: { id: pid } });
        paymentsDeleted += 1;
      }
    }

    const deletedLinks = await tx2.financeBankTransactionLink.deleteMany({
      where: { tenantId, targetType: "DTE_ISSUED", targetId: dteId },
    });

    if (!keepPaymentStatus) {
      // Mismo orden que clearTransactionLinks: recompute con reconciledAt
      // aún seteado evita el falso positivo de PAID-manual-sin-cartola.
      await recomputeDtePaymentAggregate(tx2, dteId);
    }

    const stillLinked = await tx2.financeBankTransactionLink.count({
      where: {
        tenantId,
        targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
        targetId: dteId,
      },
    });
    if (stillLinked === 0) {
      await tx2.financeDte.update({
        where: { id: dteId },
        data: { reconciledAt: null },
      });
    }

    let bankTransactionsReset = 0;
    for (const bankTxId of affectedBankTxIds) {
      const remainingLinks = await tx2.financeBankTransactionLink.count({
        where: { tenantId, bankTransactionId: bankTxId },
      });
      if (remainingLinks === 0) {
        await tx2.financeBankTransaction.update({
          where: { id: bankTxId },
          data: { reconciliationStatus: "UNMATCHED" },
        });
        await tx2.financeCashflowOccurrence.updateMany({
          where: { tenantId, bankTransactionId: bankTxId },
          data: {
            bankTransactionId: null,
            matchedAt: null,
            matchedBy: null,
            status: "PROJECTED",
          },
        });
        bankTransactionsReset += 1;
      }
    }

    return {
      allocationsRemoved: allocations.length,
      paymentsDeleted,
      bankLinksRemoved: deletedLinks.count,
      bankTransactionsReset,
    };
  });
}

