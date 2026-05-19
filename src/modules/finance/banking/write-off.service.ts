import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Decisión de write-off para un par (DTE, varianza).
 */
export interface WriteOffDecision {
  shouldApply: boolean;
  /** Cuenta destino del asiento. Solo presente si shouldApply=true. */
  accountId?: string;
  /** Dirección del ajuste: SHORT = cliente pagó menos (gasto). OVER = cliente pagó más (ingreso). */
  direction?: "SHORT" | "OVER";
  /** Razón si shouldApply=false (debug/UX). */
  reason?: string;
}

/**
 * Evalúa si una diferencia entre el total del DTE y el monto pagado cabe
 * dentro del umbral configurado para write-off automático.
 *
 * Regla efectiva: |variance| <= min(writeOffMaxAmountClp, total × writeOffMaxPercent)
 * El `min` protege ambos extremos: facturas chicas no tienen tolerancia
 * desproporcionada por el % y facturas grandes no la tienen por el absoluto.
 */
export function evaluateWriteOff(
  total: number,
  paid: number,
  config: {
    writeOffAutoEnabled: boolean;
    writeOffMaxAmountClp: number;
    writeOffMaxPercent: Decimal | number;
    writeOffShortPaymentAccountId: string | null;
    writeOffOverPaymentAccountId: string | null;
  },
): WriteOffDecision {
  if (!config.writeOffAutoEnabled) {
    return { shouldApply: false, reason: "auto_disabled" };
  }

  const variance = total - paid;
  const absVariance = Math.abs(variance);

  if (absVariance < 0.5) {
    return { shouldApply: false, reason: "no_variance" };
  }

  const pctNum =
    typeof config.writeOffMaxPercent === "number"
      ? config.writeOffMaxPercent
      : Number(config.writeOffMaxPercent.toString());
  const absoluteCap = config.writeOffMaxAmountClp;
  const relativeCap = total * pctNum;
  const effectiveTolerance = Math.min(absoluteCap, relativeCap);

  if (absVariance > effectiveTolerance) {
    return {
      shouldApply: false,
      reason: `variance_exceeds_tolerance (|${variance.toFixed(0)}| > ${effectiveTolerance.toFixed(0)})`,
    };
  }

  // variance > 0 → total > paid → cliente pagó MENOS → SHORT (gasto/pérdida).
  // variance < 0 → total < paid → cliente pagó MÁS  → OVER  (ingreso/ganancia).
  const direction: "SHORT" | "OVER" = variance > 0 ? "SHORT" : "OVER";
  const accountId =
    direction === "SHORT"
      ? config.writeOffShortPaymentAccountId
      : config.writeOffOverPaymentAccountId;

  if (!accountId) {
    return {
      shouldApply: false,
      reason: `no_account_configured_for_${direction}`,
    };
  }

  return { shouldApply: true, accountId, direction };
}

/**
 * Resuelve la cuenta CxC/CxP del DTE: para ISSUED busca "Deudores por Venta"
 * (código 1.1.02.001), para RECEIVED usa `supplier.accountPayableId` o, si
 * está null, la cuenta global de Proveedores (2.1.01.001). Si no se
 * encuentra, retorna null y el caller debe abortar el write-off SHORT.
 */
async function resolveCounterpartyAccountId(
  txClient: Prisma.TransactionClient,
  tenantId: string,
  dte: {
    direction: "ISSUED" | "RECEIVED";
    supplierId: string | null;
  },
): Promise<string | null> {
  if (dte.direction === "ISSUED") {
    const acc = await txClient.financeAccountPlan.findFirst({
      where: { tenantId, code: "1.1.02.001" },
      select: { id: true },
    });
    return acc?.id ?? null;
  }
  if (dte.supplierId) {
    const sup = await txClient.financeSupplier.findUnique({
      where: { id: dte.supplierId },
      select: { accountPayableId: true },
    });
    if (sup?.accountPayableId) return sup.accountPayableId;
  }
  const acc = await txClient.financeAccountPlan.findFirst({
    where: { tenantId, code: "2.1.01.001" },
    select: { id: true },
  });
  return acc?.id ?? null;
}

/**
 * Aplica el write-off: crea un FinanceJournalEntry POSTED con las dos líneas
 * del asiento. NO actualiza el `paymentStatus` del DTE — eso lo hace el
 * caller (recomputeDtePaymentAggregate).
 *
 * @returns El id del FinanceJournalEntry creado.
 */
export async function applyAutoWriteOff(
  txClient: Prisma.TransactionClient,
  params: {
    tenantId: string;
    dteId: string;
    dteFolio: number | null;
    dteCustomerName: string;
    variance: number; // positivo = SHORT, negativo = OVER
    direction: "SHORT" | "OVER";
    adjustmentAccountId: string;
    counterpartyAccountId: string | null;
    bankAccountPlanId: string | null;
    paymentDate: Date;
    createdBy: string;
    descriptionPrefix?: string;
  },
): Promise<string> {
  const {
    tenantId,
    dteId,
    dteFolio,
    dteCustomerName,
    variance,
    direction,
    adjustmentAccountId,
    counterpartyAccountId,
    bankAccountPlanId,
    paymentDate,
    createdBy,
    descriptionPrefix,
  } = params;

  const absVariance = Math.abs(variance);

  const year = paymentDate.getFullYear();
  const month = paymentDate.getMonth() + 1;
  const period = await txClient.financeAccountingPeriod.findUnique({
    where: { tenantId_year_month: { tenantId, year, month } },
  });
  if (!period) {
    throw new Error(
      `No existe período contable ${year}-${String(month).padStart(2, "0")} para registrar el write-off del DTE ${dteId}`,
    );
  }
  if (period.status !== "OPEN") {
    throw new Error(
      `Período contable ${year}-${String(month).padStart(2, "0")} cerrado — no se puede aplicar write-off automático.`,
    );
  }

  const lastEntry = await txClient.financeJournalEntry.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const nextNumber = (lastEntry?.number ?? 0) + 1;

  // SHORT (cliente pagó menos): DR cuenta gasto, CR CxC cliente (cierra
  //   el saldo fantasma del DTE).
  // OVER (cliente pagó más): DR banco (la plata sobrante está ahí),
  //   CR cuenta ingreso.
  let lines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    description: string;
  }>;

  if (direction === "SHORT") {
    if (!counterpartyAccountId) {
      throw new Error(
        `DTE ${dteId} sin cuenta CxC/CxP — no se puede aplicar write-off SHORT.`,
      );
    }
    lines = [
      {
        accountId: adjustmentAccountId,
        debit: absVariance,
        credit: 0,
        description: `Diferencia en cobranza factura ${dteFolio ? `#${dteFolio}` : dteId.slice(0, 8)}`,
      },
      {
        accountId: counterpartyAccountId,
        debit: 0,
        credit: absVariance,
        description: `Cierre saldo ${dteCustomerName}`,
      },
    ];
  } else {
    if (!bankAccountPlanId) {
      throw new Error(
        `Falta cuenta contable de banco — no se puede aplicar write-off OVER.`,
      );
    }
    lines = [
      {
        accountId: bankAccountPlanId,
        debit: absVariance,
        credit: 0,
        description: `Excedente recibido de ${dteCustomerName}`,
      },
      {
        accountId: adjustmentAccountId,
        debit: 0,
        credit: absVariance,
        description: `Diferencia en cobranza factura ${dteFolio ? `#${dteFolio}` : dteId.slice(0, 8)}`,
      },
    ];
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Write-off no balanceado: debit ${totalDebit} vs credit ${totalCredit}`,
    );
  }

  const baseDesc =
    direction === "SHORT" ? "diferencia en contra" : "excedente";
  const description = `${descriptionPrefix ? `${descriptionPrefix} ` : "Write-off automático "}factura ${dteFolio ? `#${dteFolio}` : dteId.slice(0, 8)} · ${baseDesc} $${absVariance.toFixed(0)}`;

  const entry = await txClient.financeJournalEntry.create({
    data: {
      tenantId,
      number: nextNumber,
      date: paymentDate,
      periodId: period.id,
      description,
      reference: `WRITE_OFF·${dteId.slice(0, 8)}`,
      sourceType: "RECONCILIATION",
      sourceId: dteId,
      status: "POSTED",
      postedBy: createdBy,
      postedAt: new Date(),
      totalDebit: new Decimal(totalDebit),
      totalCredit: new Decimal(totalCredit),
      createdBy,
      lines: {
        create: lines.map((l) => ({
          accountId: l.accountId,
          description: l.description,
          debit: new Decimal(l.debit),
          credit: new Decimal(l.credit),
        })),
      },
    },
    select: { id: true },
  });

  return entry.id;
}

/**
 * Variante MANUAL del write-off: el usuario decide aplicar el ajuste aunque
 * la varianza exceda el umbral automático. Recibe una cuenta destino explícita
 * y un motivo obligatorio. Marca el DTE como PAID y crea el asiento.
 */
export async function applyManualWriteOff(params: {
  tenantId: string;
  dteId: string;
  accountPlanId: string;
  reason: string;
  userId: string;
}): Promise<string> {
  const { tenantId, dteId, accountPlanId, reason, userId } = params;

  return prisma.$transaction(async (tx) => {
    const dte = await tx.financeDte.findFirst({
      where: { id: dteId, tenantId },
      select: {
        id: true,
        folio: true,
        direction: true,
        supplierId: true,
        receiverName: true,
        issuerName: true,
        totalAmount: true,
        amountPaid: true,
      },
    });
    if (!dte) throw new Error("DTE no encontrado");

    const total = Number(dte.totalAmount);
    const paid = Number(dte.amountPaid);
    const variance = total - paid;
    if (Math.abs(variance) < 0.5) {
      throw new Error("No hay diferencia que ajustar — el DTE ya está cubierto.");
    }

    const account = await tx.financeAccountPlan.findFirst({
      where: { id: accountPlanId, tenantId, isActive: true, acceptsEntries: true },
      select: { id: true },
    });
    if (!account) {
      throw new Error("Cuenta contable no válida para este tenant.");
    }

    const direction: "SHORT" | "OVER" = variance > 0 ? "SHORT" : "OVER";
    const counterpartyName =
      dte.direction === "ISSUED" ? dte.receiverName : dte.issuerName;
    const counterpartyAccountId = await resolveCounterpartyAccountId(tx, tenantId, {
      direction: dte.direction === "ISSUED" ? "ISSUED" : "RECEIVED",
      supplierId: dte.supplierId,
    });

    // Para OVER manual no exigimos bankAccountPlanId — usamos la cuenta
    // CxC/CxP como contrapartida (el dinero entró por algún canal, y el
    // motivo manual lo justifica explícitamente).
    const bankAccountPlanId =
      direction === "OVER" ? counterpartyAccountId : null;

    const entryId = await applyAutoWriteOff(tx, {
      tenantId,
      dteId,
      dteFolio: dte.folio,
      dteCustomerName: counterpartyName ?? "Contraparte",
      variance,
      direction,
      adjustmentAccountId: accountPlanId,
      counterpartyAccountId,
      bankAccountPlanId,
      paymentDate: new Date(),
      createdBy: userId,
      descriptionPrefix: `Write-off MANUAL · ${reason} ·`,
    });

    await tx.financeDte.update({
      where: { id: dteId },
      data: {
        amountPaid: new Decimal(total),
        amountPending: new Decimal(0),
        paymentStatus: "PAID",
      },
    });

    return entryId;
  });
}

export { resolveCounterpartyAccountId };
