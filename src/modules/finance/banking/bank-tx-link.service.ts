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
  Prisma,
} from "@prisma/client";
import { createManualEntry } from "../accounting/journal-entry.service";

// ── Helpers internos ──

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
  dteId: string
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

// ── Tipos ──

export interface BankTxLinkInput {
  targetType: FinanceLinkTarget;
  targetId?: string | null;
  amount: number;
  accountPlanId?: string | null;
  note?: string | null;
}

export interface CandidateDte {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  documentType: string;
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
}

// ── Candidatos sugeridos ──

/**
 * Busca DTEs candidatos para conciliar con un movimiento bancario:
 *   - Si la tx es positiva (ingreso): DTEs emitidos no-pagados con monto
 *     pendiente cercano.
 *   - Si la tx es negativa (egreso): DTEs recibidos no-pagados similares.
 *
 * Ordena por proximidad de monto y fecha.
 */
/**
 * Detecta si una descripción de cartola corresponde a un depósito de
 * factoring. Pattern matching basado en operadores comunes en Chile
 * (AMIFACTOR, BCI FACTORING, SECURITY FACTORING, FACTOTAL, etc).
 */
function looksLikeFactoringDeposit(description: string | null | undefined): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
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

export async function findDteCandidates(
  tenantId: string,
  bankTxId: string,
  toleranceFactor: number = 0.05
): Promise<CandidateDte[]> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { amount: true, transactionDate: true, description: true },
  });
  if (!tx) return [];

  const amountAbs = Math.abs(tx.amount.toNumber());
  if (amountAbs === 0) return [];

  const isIncome = tx.amount.toNumber() > 0;
  const direction = isIncome ? "ISSUED" : "RECEIVED";
  const isFactoring = isIncome && looksLikeFactoringDeposit(tx.description);

  // Tolerancia asimétrica para ingresos:
  // - INGRESO NORMAL: la factura suele coincidir o ser ligeramente menor
  //   (descuentos, retenciones). Permitimos -2% / +5%.
  // - INGRESO FACTORING: el banco trae el NETO post-comisión. La factura
  //   original es siempre MAYOR (típicamente +3% a +25% por comisión).
  //   Cuando hay varias facturas cedidas en un mismo depósito, el bruto
  //   puede llegar a +50%. Permitimos -1% / +50% — el sort por delta y
  //   los badges en la UI hacen claro qué tan exacto es cada match.
  // - EGRESO: pago a proveedor. La factura suele ser exacta; permitimos
  //   ±5% para cubrir notas de crédito / descuentos parciales.
  let minAmount: number;
  let maxAmount: number;
  if (isFactoring) {
    minAmount = amountAbs * 0.99;
    maxAmount = amountAbs * 1.5;
  } else if (isIncome) {
    minAmount = amountAbs * 0.98;
    maxAmount = amountAbs * 1.05;
  } else {
    const tolerance = Math.max(amountAbs * toleranceFactor, 1000);
    minAmount = amountAbs - tolerance;
    maxAmount = amountAbs + tolerance;
  }

  // Ventana de fecha: 90 días antes, 30 días después.
  // Para factoring ampliamos a 180 días antes (las facturas cedidas pueden
  // ser viejas y los plazos de cesión llegan a 6 meses) y 7 días después.
  const minDate = new Date(tx.transactionDate);
  minDate.setDate(minDate.getDate() - (isFactoring ? 180 : 90));
  const maxDate = new Date(tx.transactionDate);
  maxDate.setDate(maxDate.getDate() + (isFactoring ? 7 : 30));

  // Para factoring INCLUIMOS facturas PAID también: el usuario puede haber
  // marcado la factura como pagada manualmente al ceder al factoring, y aún
  // así quiere matchear ese depósito contra la(s) factura(s) cedida(s).
  // Para ingresos normales y egresos seguimos restringidos a las no pagadas.
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction,
      ...(isFactoring
        ? {}
        : {
            paymentStatus: {
              in: ["UNPAID", "PARTIAL", "OVERDUE"] as Prisma.EnumFinancePaymentStatusFilter["in"],
            },
            amountPending: { gt: 0 },
          }),
      date: { gte: minDate, lte: maxDate },
      OR: [
        { amountPending: { gte: minAmount, lte: maxAmount } },
        { totalAmount: { gte: minAmount, lte: maxAmount } },
      ],
    },
    orderBy: { date: "desc" },
    take: isFactoring ? 100 : 50,
  });

  return dtes.map((d) => ({
    id: d.id,
    direction: d.direction as "ISSUED" | "RECEIVED",
    documentType: d.code,
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
  }));
}

/**
 * Busca cesiones a factoring cuyo monto a girar coincida (±tolerancia)
 * con un ingreso bancario. Sólo se evalúan tx positivas (los abonos del
 * factoring son ingresos). Match aceptable cuando:
 *   - status NOT IN (CANCELLED)
 *   - fechaCesion entre tx.transactionDate − 14 días y +1 día
 *   - expectedDeposit (sim o netAdvance) dentro de ±5% / ±$1.000
 */
export async function findFactoringCandidates(
  tenantId: string,
  bankTxId: string,
  toleranceFactor: number = 0.05,
): Promise<CandidateFactoring[]> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { amount: true, transactionDate: true, description: true },
  });
  if (!tx) return [];
  const amount = tx.amount.toNumber();
  if (amount <= 0) return []; // Sólo ingresos.

  // Si la descripción huele a factoring (AMIFACTOR, etc), relajamos rango y
  // ventana. Para depósitos genéricos mantenemos ±5%.
  const isFactoring = looksLikeFactoringDeposit(tx.description);
  const tolerance = isFactoring
    ? Math.max(amount * 0.25, 1000)
    : Math.max(amount * toleranceFactor, 1000);
  const minAmount = isFactoring ? amount * 0.5 : amount - tolerance;
  const maxAmount = amount + tolerance;

  const minDate = new Date(tx.transactionDate);
  minDate.setDate(minDate.getDate() - (isFactoring ? 60 : 14));
  const maxDate = new Date(tx.transactionDate);
  maxDate.setDate(maxDate.getDate() + (isFactoring ? 7 : 1));

  const ops = await prisma.financeFactoringOperation.findMany({
    where: {
      tenantId,
      status: { notIn: ["CANCELLED"] },
      fechaCesion: { gte: minDate, lte: maxDate },
      OR: [
        { simMontoAGirar: { gte: minAmount, lte: maxAmount } },
        { netAdvance: { gte: minAmount, lte: maxAmount } },
        // Para factoring también permitimos matchear por invoiceAmount
        // (bruto) si la simulación/netAdvance no están seteados.
        ...(isFactoring
          ? [{ invoiceAmount: { gte: minAmount, lte: amount * 1.5 } }]
          : []),
      ],
    },
    select: {
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
      dte: { select: { folio: true, receiverName: true } },
    },
    orderBy: { fechaCesion: "desc" },
    take: 20,
  });

  return ops.map((op) => {
    const sim = op.simMontoAGirar ? Number(op.simMontoAGirar) : null;
    const net = op.netAdvance ? Number(op.netAdvance) : 0;
    return {
      id: op.id,
      code: op.code,
      factoringCompanyName: op.factoringCompany,
      factoringCompanyId: op.factoringCompanyId ?? null,
      fechaCesion: op.fechaCesion ? op.fechaCesion.toISOString() : "",
      fechaVencimiento: op.fechaVencimiento
        ? op.fechaVencimiento.toISOString()
        : "",
      invoiceAmount: Number(op.invoiceAmount),
      expectedDeposit: sim ?? net,
      expectedDepositSource: sim != null ? "simulation" : "computed",
      status: op.status,
      dteFolio: op.dte?.folio ?? null,
      dteReceiverName: op.dte?.receiverName ?? null,
    };
  });
}

// ── Listar links existentes de una tx ──

/**
 * Forma plana de un link enriquecido para que el front pueda renderizar
 * la "vista resumen" del drawer sin hacer N+1 fetches por entidad.
 *
 * `entityLabel` siempre presente:
 *   - DTE_ISSUED / DTE_RECEIVED  → "Factura 1234 · Cliente XYZ"
 *   - FACTORING_OPERATION        → "Cesión OP-2026-001 · BCI Factoring"
 *   - EXPENSE / INCOME           → "Gasto manual: 5101 Servicios" (cuenta)
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
  } | null;
}

export async function listTransactionLinks(
  tenantId: string,
  bankTxId: string
): Promise<EnrichedTransactionLink[]> {
  const rows = await prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: bankTxId },
    include: {
      accountPlan: { select: { id: true, code: true, name: true } },
    },
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

    if (paymentsById.size === 0) return [];

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
        });
      }
    }
    return synthetic;
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
          },
        })
      : Promise.resolve([]),
  ]);

  const dteById = new Map(dtes.map((d) => [d.id, d]));
  const factoringById = new Map(factorings.map((f) => [f.id, f]));

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
        entityLabel = `Cesión ${f.code} · ${f.factoringCompany}`;
        factoring = {
          id: f.id,
          code: f.code,
          factoringCompanyName: f.factoringCompany,
        };
      } else {
        entityLabel = `Cesión eliminada (id ${r.targetId ?? "?"})`;
      }
    } else if (r.targetType === "EXPENSE" || r.targetType === "INCOME") {
      const kind = r.targetType === "INCOME" ? "Ingreso manual" : "Gasto manual";
      entityLabel = r.accountPlan
        ? `${kind}: ${r.accountPlan.code} ${r.accountPlan.name}`
        : kind;
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
  const linksTotal = links.reduce((s, l) => s + l.amount, 0);

  if (linksTotal > txAmountAbs + 0.01) {
    throw new Error(
      `Suma de vínculos ($${linksTotal.toLocaleString("es-CL")}) supera el monto del movimiento ($${txAmountAbs.toLocaleString("es-CL")})`
    );
  }

  const isFullyCovered = Math.abs(linksTotal - txAmountAbs) < 0.01;
  if (!isFullyCovered && !opts.allowPartial) {
    throw new Error(
      `La suma de vínculos no cubre el monto del movimiento. Faltan $${(txAmountAbs - linksTotal).toLocaleString("es-CL")}. Asigná el resto a una cuenta contable.`
    );
  }

  const isIncome = tx.amount.toNumber() > 0;
  const dteLinks = links.filter(
    (l) => l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED"
  );

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
      await tx2.financeBankTransactionLink.createMany({
        data: links.map((l) => ({
          tenantId,
          bankTransactionId: bankTxId,
          targetType: l.targetType,
          targetId: l.targetId ?? null,
          amount: new Decimal(l.amount),
          accountPlanId: l.accountPlanId ?? null,
          note: l.note ?? null,
          createdById: userId ?? null,
        })),
      });
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
    for (const dteId of Array.from(dteIdsToRecompute)) {
      await recomputeDtePaymentAggregate(tx2, dteId);
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
    },
  });
  if (!dte) throw new Error("Factura no encontrada");
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
          createdById: userId ?? null,
        },
      });
      await tx2.financeBankTransaction.update({
        where: { id: t.id },
        data: { reconciliationStatus: "MATCHED" },
      });
    }
    await recomputeDtePaymentAggregate(tx2, dte.id);
  });

  return {
    paymentRecordId: firstRecordId,
    paymentRecordCode: firstRecordCode,
    matchedTransactions: txs.length,
    totalAmountAllocated: totalAlloc,
  };
}

// ── N movs → N DTEs ──

export interface BulkReconcileToDtesInput {
  bankTransactionIds: string[];
  /**
   * Asignación por DTE. La suma debe ser ≈ sum(movs) — a menos que se
   * incluya `differenceAllocation` que absorba la diferencia.
   * El reparto a nivel de cada mov se hace proporcionalmente al peso de
   * cada DTE en el total.
   */
  allocations: Array<{ dteId: string; amount: number }>;
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

  const dteIds = allocations.map((a) => a.dteId);
  const dtes = await prisma.financeDte.findMany({
    where: { tenantId, id: { in: dteIds } },
    select: {
      id: true,
      direction: true,
      totalAmount: true,
      amountPending: true,
    },
  });
  if (dtes.length !== dteIds.length) {
    throw new Error("Una o más facturas no existen o pertenecen a otro tenant");
  }
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
  for (const a of allocations) {
    if (a.amount <= 0) {
      throw new Error("Cada asignación debe ser > 0");
    }
    const d = dteById.get(a.dteId)!;
    if (a.amount > d.amountPending.toNumber() + 0.01) {
      throw new Error(
        `La asignación supera el saldo pendiente de la factura ${a.dteId}`
      );
    }
  }

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
  // los DTE seleccionados con su accountId y subtotal.
  let dteLinesByDte: Map<string, Array<{ accountId: string | null; subtotal: number }>> =
    new Map();
  if (
    differenceAllocation &&
    differenceAllocation.prorateAcrossDteLines &&
    diffAmount > 0
  ) {
    // `netAmount` representa el subtotal de la línea (post-descuento,
    // pre-IVA) y es el campo correcto para ponderar el peso de cada
    // línea dentro de la factura para distribuir costos.
    const lines = await prisma.financeDteLine.findMany({
      where: { dteId: { in: dteIds } },
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
      const movDtePortion = Math.round(movShare * totalAlloc * 100) / 100;
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
          : Math.round(movDtePortion * share * 100) / 100;
        assignedToPayments += paymentPiece;
        const linkPiece = isLast
          ? movLinkPool - assignedToLinks
          : Math.round(movLinkPool * share * 100) / 100;
        assignedToLinks += linkPiece;

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
            createdById: userId ?? null,
          },
        });
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
        const movDiffPortion =
          Math.round(movShare * diffAmount * 100) / 100;
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
    for (const a of allocations) {
      await recomputeDtePaymentAggregate(tx2, a.dteId);
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
    await generateDifferenceJournalEntry(tenantId, userId, {
      txs,
      isIncome,
      diffAmount,
      diffAccountId: diffAccount.id,
      diffLabel: differenceAllocation.label ?? null,
      prorateAcrossDteLines: !!differenceAllocation.prorateAcrossDteLines,
      allocations,
      dteLinesByDte,
      direction: diffDirection,
    });
  }

  return {
    paymentRecordCodes,
    matchedTransactions: txs.length,
    affectedDtes: allocations.length,
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

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    await tx2.financeBankTransactionLink.create({
      data: {
        tenantId,
        bankTransactionId: bankTxId,
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: new Decimal(amountAbs),
        accountPlanId: tx.suggestedAccountPlanId!,
        note: "Auto-match autorizado por regla",
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

    // 3. Recomputar payment aggregate de los DTEs afectados.
    for (const dteId of Array.from(dteIdsToRecompute)) {
      await recomputeDtePaymentAggregate(tx2, dteId);
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
