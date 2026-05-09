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
  folio: number | null;
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

// ── Candidatos sugeridos ──

/**
 * Busca DTEs candidatos para conciliar con un movimiento bancario:
 *   - Si la tx es positiva (ingreso): DTEs emitidos no-pagados con monto
 *     pendiente cercano.
 *   - Si la tx es negativa (egreso): DTEs recibidos no-pagados similares.
 *
 * Ordena por proximidad de monto y fecha.
 */
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
  const tolerance = Math.max(amountAbs * toleranceFactor, 1000); // ±5% o $1000
  const minAmount = amountAbs - tolerance;
  const maxAmount = amountAbs + tolerance;

  const isIncome = tx.amount.toNumber() > 0;
  const direction = isIncome ? "ISSUED" : "RECEIVED";

  // Ventana de fecha: 90 días antes, 30 días después
  const minDate = new Date(tx.transactionDate);
  minDate.setDate(minDate.getDate() - 90);
  const maxDate = new Date(tx.transactionDate);
  maxDate.setDate(maxDate.getDate() + 30);

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction,
      paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      date: { gte: minDate, lte: maxDate },
      amountPending: { gt: 0 },
      // Filtro amplio por monto pendiente cercano
      OR: [
        { amountPending: { gte: minAmount, lte: maxAmount } },
        { totalAmount: { gte: minAmount, lte: maxAmount } },
      ],
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return dtes.map((d) => ({
    id: d.id,
    direction: d.direction as "ISSUED" | "RECEIVED",
    documentType: d.documentType ?? "",
    folio: d.folio ?? null,
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

// ── Listar links existentes de una tx ──

export async function listTransactionLinks(
  tenantId: string,
  bankTxId: string
) {
  return prisma.financeBankTransactionLink.findMany({
    where: { tenantId, bankTransactionId: bankTxId },
    include: {
      accountPlan: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
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
    select: { id: true, amount: true },
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

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
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
}

/** Elimina todos los links de una tx y la deja UNMATCHED. */
export async function clearTransactionLinks(
  tenantId: string,
  bankTxId: string
): Promise<void> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { id: true },
  });
  if (!tx) throw new Error("Movimiento no encontrado");

  await prisma.$transaction(async (tx2: Prisma.TransactionClient) => {
    await tx2.financeBankTransactionLink.deleteMany({
      where: { tenantId, bankTransactionId: bankTxId },
    });
    await tx2.financeBankTransaction.update({
      where: { id: bankTxId },
      data: { reconciliationStatus: "UNMATCHED" },
    });
  });
}
