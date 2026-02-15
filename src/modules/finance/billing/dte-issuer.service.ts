/**
 * DTE Issuer Service
 * Orchestrates the DTE issuance flow: validate, calculate, issue, store, auto-entry
 */

import { prisma } from "@/lib/prisma";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import type { DteIssueRequest, DteLineItem } from "../shared/adapters/dte-provider.adapter";
import { isDteTypeValid, IVA_RATE } from "../shared/constants/dte-types";
import { validateRut } from "../shared/validators/rut.validator";
import { buildInvoiceIssuedEntry } from "../accounting/auto-entry.builder";
import { createManualEntry, postEntry } from "../accounting/journal-entry.service";

export type IssueDteInput = {
  dteType: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail?: string;
  lines: {
    itemCode?: string;
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    discountPct?: number;
    isExempt?: boolean;
    accountId?: string;
    costCenterId?: string;
  }[];
  currency?: string;
  notes?: string;
  accountId?: string; // CRM account reference
  autoSendEmail?: boolean;
};

/**
 * Issue a new DTE (factura, boleta, etc.)
 */
export async function issueDte(
  tenantId: string,
  createdBy: string,
  input: IssueDteInput
) {
  // 1. Validate DTE type
  if (!isDteTypeValid(input.dteType)) {
    throw new Error(`Tipo de DTE ${input.dteType} no es valido`);
  }

  // 2. Validate receiver RUT
  const rutValidation = validateRut(input.receiverRut);
  if (!rutValidation.valid) {
    throw new Error(`RUT receptor invalido: ${rutValidation.error}`);
  }

  // 3. Calculate line amounts
  let totalNet = 0;
  let totalExempt = 0;
  const calculatedLines: (IssueDteInput["lines"][0] & { netAmount: number })[] = [];

  for (const line of input.lines) {
    const gross = line.quantity * line.unitPrice;
    const discount = gross * (line.discountPct ?? 0) / 100;
    const net = Math.round(gross - discount);

    if (line.isExempt) {
      totalExempt += net;
    } else {
      totalNet += net;
    }

    calculatedLines.push({ ...line, netAmount: net });
  }

  // 4. Calculate tax
  const isExempt = input.dteType === 34; // Factura Exenta
  const taxRate = isExempt ? 0 : IVA_RATE;
  const taxAmount = isExempt ? 0 : Math.round(totalNet * taxRate / 100);
  const totalAmount = totalNet + totalExempt + taxAmount;

  // 5. Get next folio
  const lastDte = await prisma.financeDte.findFirst({
    where: { tenantId, direction: "ISSUED", dteType: input.dteType },
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const nextFolio = (lastDte?.folio ?? 0) + 1;

  // 6. Build code
  const code = `${input.dteType}-${nextFolio}`;

  // 7. Get issuer info (from tenant settings or env)
  const issuerRut = process.env.COMPANY_RUT ?? "76000000-0";
  const issuerName = process.env.COMPANY_NAME ?? "Empresa";

  // 8. Call DTE provider
  const provider = getDteProvider();
  const dteRequest: DteIssueRequest = {
    dteType: input.dteType,
    folio: nextFolio,
    date: new Date().toISOString().split("T")[0],
    issuerRut,
    issuerName,
    receiverRut: input.receiverRut,
    receiverName: input.receiverName,
    receiverEmail: input.receiverEmail,
    items: calculatedLines.map((l, i): DteLineItem => ({
      lineNumber: i + 1,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      netAmount: l.netAmount,
      isExempt: l.isExempt ?? false,
    })),
    netAmount: totalNet,
    exemptAmount: totalExempt,
    taxRate,
    taxAmount,
    totalAmount,
  };

  const result = await provider.issue(dteRequest);

  if (!result.success) {
    throw new Error(`Error emitiendo DTE: ${result.error ?? "Error desconocido"}`);
  }

  // 9. Store DTE in database
  const dte = await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "ISSUED",
      dteType: input.dteType,
      folio: nextFolio,
      code,
      date: new Date(),
      issuerRut,
      issuerName,
      receiverRut: input.receiverRut,
      receiverName: input.receiverName,
      receiverEmail: input.receiverEmail ?? null,
      currency: (input.currency as any) ?? "CLP",
      netAmount: totalNet,
      exemptAmount: totalExempt,
      taxRate,
      taxAmount,
      totalAmount,
      siiStatus: "PENDING",
      siiTrackId: result.trackId ?? null,
      pdfUrl: result.pdfUrl ?? null,
      xmlUrl: result.xmlUrl ?? null,
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: totalAmount,
      accountId: input.accountId ?? null,
      createdBy,
      notes: input.notes ?? null,
      lines: {
        create: calculatedLines.map((l, i) => ({
          lineNumber: i + 1,
          itemCode: l.itemCode ?? null,
          itemName: l.itemName,
          description: l.description ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct ?? 0,
          netAmount: l.netAmount,
          isExempt: l.isExempt ?? false,
          accountId: l.accountId ?? null,
          costCenterId: l.costCenterId ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  // 10. Auto-generate journal entry for facturas (not boletas)
  if (input.dteType === 33 || input.dteType === 34) {
    try {
      const entryInput = await buildInvoiceIssuedEntry(tenantId, {
        date: new Date().toISOString().split("T")[0],
        folio: nextFolio,
        dteId: dte.id,
        netAmount: totalNet,
        taxAmount,
        totalAmount,
        receiverName: input.receiverName,
      });

      const entry = await createManualEntry(tenantId, createdBy, entryInput);
      await postEntry(tenantId, entry.id, createdBy);

      // Link journal entry to DTE
      await prisma.financeDte.update({
        where: { id: dte.id },
        data: { journalEntryId: entry.id },
      });
    } catch (err) {
      console.error("Auto-entry failed for DTE:", err);
      // Don't fail the DTE issuance if auto-entry fails
    }
  }

  return dte;
}

/**
 * Get DTE status from provider
 */
export async function checkDteStatus(tenantId: string, dteId: string) {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
  });
  if (!dte) throw new Error("DTE no encontrado");
  if (!dte.siiTrackId) throw new Error("DTE no tiene track ID del SII");

  const provider = getDteProvider();
  const status = await provider.getStatus(dte.siiTrackId);

  // Update status in DB
  await prisma.financeDte.update({
    where: { id: dteId },
    data: {
      siiStatus: status.status as any,
      siiResponse: status.rawResponse as any ?? null,
      siiAcceptedAt: status.status === "ACCEPTED" ? new Date() : null,
    },
  });

  return status;
}
