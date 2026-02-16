/**
 * Auto-Entry Builder
 * Builds journal entry inputs from business events
 */

import { prisma } from "@/lib/prisma";
import type { JournalEntryInput } from "../shared/types/accounting.types";

// Well-known account codes
const ACCOUNTS = {
  DEUDORES_VENTA: "1.1.02.001",
  IVA_CREDITO: "1.1.03.001",
  PROVEEDORES: "2.1.01.001",
  IVA_DEBITO: "2.1.02.001",
  INGRESO_SERVICIOS: "4.1.01.001",
} as const;

type AutoEntryEvent =
  | "INVOICE_ISSUED"
  | "INVOICE_RECEIVED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_MADE";

async function resolveAccountId(tenantId: string, code: string): Promise<string> {
  const account = await prisma.financeAccountPlan.findFirst({
    where: { tenantId, code },
  });
  if (!account) throw new Error(`Cuenta ${code} no encontrada en el plan de cuentas`);
  return account.id;
}

/**
 * Build journal entry for an issued invoice (factura emitida)
 * DR Deudores por Venta (total) / CR Ingreso (net) + CR IVA DF (tax)
 */
export async function buildInvoiceIssuedEntry(
  tenantId: string,
  data: {
    date: string;
    folio: number;
    dteId: string;
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    receiverName: string;
    revenueAccountId?: string; // Custom revenue account
  }
): Promise<JournalEntryInput> {
  const deudoresId = await resolveAccountId(tenantId, ACCOUNTS.DEUDORES_VENTA);
  const ivaDebitoId = await resolveAccountId(tenantId, ACCOUNTS.IVA_DEBITO);
  const ingresoId = data.revenueAccountId ?? await resolveAccountId(tenantId, ACCOUNTS.INGRESO_SERVICIOS);

  const lines = [
    { accountId: deudoresId, description: `Deudor: ${data.receiverName}`, debit: data.totalAmount, credit: 0 },
    { accountId: ingresoId, description: `Ingreso Fact. ${data.folio}`, debit: 0, credit: data.netAmount },
  ];

  if (data.taxAmount > 0) {
    lines.push({ accountId: ivaDebitoId, description: `IVA DF Fact. ${data.folio}`, debit: 0, credit: data.taxAmount });
  }

  return {
    date: data.date,
    description: `Factura emitida #${data.folio} - ${data.receiverName}`,
    reference: `DTE-${data.folio}`,
    sourceType: "INVOICE_ISSUED",
    sourceId: data.dteId,
    lines,
  };
}

/**
 * Build journal entry for a received invoice (factura recibida)
 * DR Gasto (net) + DR IVA CF (tax) / CR Proveedores (total)
 */
export async function buildInvoiceReceivedEntry(
  tenantId: string,
  data: {
    date: string;
    folio: number;
    dteId: string;
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    issuerName: string;
    expenseAccountId: string; // Which expense account to debit
  }
): Promise<JournalEntryInput> {
  const proveedoresId = await resolveAccountId(tenantId, ACCOUNTS.PROVEEDORES);
  const ivaCreditoId = await resolveAccountId(tenantId, ACCOUNTS.IVA_CREDITO);

  const lines = [
    { accountId: data.expenseAccountId, description: `Gasto Fact. ${data.folio}`, debit: data.netAmount, credit: 0 },
  ];

  if (data.taxAmount > 0) {
    lines.push({ accountId: ivaCreditoId, description: `IVA CF Fact. ${data.folio}`, debit: data.taxAmount, credit: 0 });
  }

  lines.push({ accountId: proveedoresId, description: `Proveedor: ${data.issuerName}`, debit: 0, credit: data.totalAmount });

  return {
    date: data.date,
    description: `Factura recibida #${data.folio} - ${data.issuerName}`,
    reference: `RCV-${data.folio}`,
    sourceType: "INVOICE_RECEIVED",
    sourceId: data.dteId,
    lines,
  };
}

/**
 * Build journal entry for a received payment (cobro)
 * DR Banco / CR Deudores por Venta
 */
export async function buildPaymentReceivedEntry(
  tenantId: string,
  data: {
    date: string;
    paymentId: string;
    amount: number;
    bankAccountPlanId: string; // The plan account linked to the bank account
    customerName: string;
    reference?: string;
  }
): Promise<JournalEntryInput> {
  const deudoresId = await resolveAccountId(tenantId, ACCOUNTS.DEUDORES_VENTA);

  return {
    date: data.date,
    description: `Cobro de ${data.customerName}`,
    reference: data.reference ?? `PAY-${data.paymentId.slice(0, 8)}`,
    sourceType: "PAYMENT",
    sourceId: data.paymentId,
    lines: [
      { accountId: data.bankAccountPlanId, description: `Deposito ${data.customerName}`, debit: data.amount, credit: 0 },
      { accountId: deudoresId, description: `Cobro deudor: ${data.customerName}`, debit: 0, credit: data.amount },
    ],
  };
}

/**
 * Build journal entry for a made payment (pago)
 * DR Proveedores / CR Banco
 */
export async function buildPaymentMadeEntry(
  tenantId: string,
  data: {
    date: string;
    paymentId: string;
    amount: number;
    bankAccountPlanId: string;
    supplierName: string;
    reference?: string;
  }
): Promise<JournalEntryInput> {
  const proveedoresId = await resolveAccountId(tenantId, ACCOUNTS.PROVEEDORES);

  return {
    date: data.date,
    description: `Pago a ${data.supplierName}`,
    reference: data.reference ?? `PAY-${data.paymentId.slice(0, 8)}`,
    sourceType: "PAYMENT",
    sourceId: data.paymentId,
    lines: [
      { accountId: proveedoresId, description: `Pago proveedor: ${data.supplierName}`, debit: data.amount, credit: 0 },
      { accountId: data.bankAccountPlanId, description: `Egreso ${data.supplierName}`, debit: 0, credit: data.amount },
    ],
  };
}
