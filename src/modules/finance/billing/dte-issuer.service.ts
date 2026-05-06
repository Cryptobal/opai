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
import { reserveNextFolio } from "./folio-tracker.service";
import { sendDteEmail } from "./dte-email.service";

export type IssueDteInput = {
  dteType: number;
  receiverRut: string;
  receiverName: string;
  /**
   * Email primario del receptor — el único que va al XML SII como
   * <CorreoRecep>. Si querés enviar copia a más gente, usá
   * `receiverEmailCc` (no afecta el XML SII, solo el envío externo).
   */
  receiverEmail?: string;
  /**
   * Lista de emails adicionales (CC). El XML SII no los lleva, pero
   * OPAI envía copia del PDF/XML a todos vía Resend.
   */
  receiverEmailCc?: string[];
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
    refuerzoSolicitudId?: string;
  }[];
  currency?: string;
  notes?: string;
  accountId?: string; // CRM account reference
  autoSendEmail?: boolean;
  /**
   * Referencia al DTE original. OBLIGATORIO para tipos 56 (Nota de
   * Débito) y 61 (Nota de Crédito) — se valida abajo. El SII exige
   * que estos tipos incluyan el bloque <Referencia> en el XML.
   */
  reference?: {
    /** ID del DTE original en BD (FK lógica a FinanceDte). */
    docId?: string;
    /** Tipo del DTE original (33, 34, 39, 56). */
    type: number;
    /** Folio del DTE original. */
    folio: number;
    /** Fecha de emisión del DTE original (YYYY-MM-DD). */
    date: string;
    /** Código SII CodRef: 1=anula, 2=corrige texto, 3=corrige montos. */
    code: 1 | 2 | 3;
    /** Razón en texto libre (RazonRef). */
    reason: string;
  };
  /**
   * Referencias adicionales (no-DTE) del DTE: Orden de Compra, HES,
   * Contrato, Resolución, etc. Se concatenan al bloque <Referencia>
   * después de la referencia principal. Opcional, hasta 40 totales por
   * DTE según especificación SII.
   */
  additionalReferences?: Array<{
    tipoDocRef: string;
    folioRef: string;
    fchRef: string;
    razonRef: string;
  }>;
};

const DTE_TYPES_REQUIRING_REFERENCE = [56, 61] as const;

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

  // 1b. Validar referencia obligatoria SII para Nota de Crédito (61)
  // y Nota de Débito (56). Sin este bloque el SII rechaza el DTE.
  if (
    DTE_TYPES_REQUIRING_REFERENCE.includes(
      input.dteType as (typeof DTE_TYPES_REQUIRING_REFERENCE)[number],
    )
  ) {
    const r = input.reference;
    if (!r || !r.type || !r.folio || !r.date || !r.code || !r.reason?.trim()) {
      throw new Error(
        `Notas de Crédito (61) y Débito (56) requieren bloque 'reference' con tipo, folio, fecha, código y razón del DTE original.`,
      );
    }
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

  // 5–9. Folio reservation + provider call + DTE persistence inside one
  // transaction so a provider error rolls back the folio increment too.
  const { dte, nextFolio } = await prisma.$transaction(
    async (tx) => {
      const config = await tx.tenantDteConfig.findUnique({ where: { tenantId } });
      const useTracker = config?.provider === "SIMPLEAPI";

      let folio: number;
      let cafXml: Buffer | undefined;

      if (useTracker) {
        const reserved = await reserveNextFolio(tx, tenantId, input.dteType);
        folio = reserved.folio;
        cafXml = reserved.cafXml;
      } else {
        const lastDte = await tx.financeDte.findFirst({
          where: { tenantId, direction: "ISSUED", dteType: input.dteType },
          orderBy: { folio: "desc" },
          select: { folio: true },
        });
        folio = (lastDte?.folio ?? 0) + 1;
      }

      const code = `${input.dteType}-${folio}`;

      // Issuer info: tenant config takes precedence over env vars
      const issuerRut = config?.emisorRut ?? process.env.COMPANY_RUT ?? "12345678-9";
      const issuerName = config?.emisorRazonSocial ?? process.env.COMPANY_NAME ?? "Empresa";

      const provider = await getDteProvider(tenantId);
      const dteRequest: DteIssueRequest = {
        dteType: input.dteType,
        folio,
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
        ...(input.reference && {
          reference: {
            dteType: input.reference.type,
            folio: input.reference.folio,
            date: input.reference.date,
            code: input.reference.code,
            reason: input.reference.reason,
          },
        }),
        ...(input.additionalReferences && input.additionalReferences.length > 0
          ? { additionalReferences: input.additionalReferences }
          : {}),
        ...(cafXml ? { cafXml } : {}),
      };

      const providerResult = await provider.issue(dteRequest);

      if (!providerResult.success) {
        // Throwing inside $transaction triggers automatic rollback,
        // including the folio increment in tracker.
        throw new Error(
          `Error emitiendo DTE: ${providerResult.error ?? "Error desconocido"}`
        );
      }

      const created = await tx.financeDte.create({
        data: {
          tenantId,
          direction: "ISSUED",
          dteType: input.dteType,
          folio,
          code,
          date: new Date(),
          issuerRut,
          issuerName,
          receiverRut: input.receiverRut,
          receiverName: input.receiverName,
          receiverEmail: input.receiverEmail ?? null,
          receiverEmailCc: input.receiverEmailCc ?? [],
          currency: (input.currency as any) ?? "CLP",
          netAmount: totalNet,
          exemptAmount: totalExempt,
          taxRate,
          taxAmount,
          totalAmount,
          siiStatus: "PENDING",
          siiTrackId: providerResult.trackId ?? null,
          pdfUrl: providerResult.pdfUrl ?? null,
          xmlUrl: providerResult.xmlUrl ?? null,
          paymentStatus: "UNPAID",
          amountPaid: 0,
          amountPending: totalAmount,
          accountId: input.accountId ?? null,
          createdBy,
          notes: input.notes ?? null,
          referenceDteId: input.reference?.docId ?? null,
          referenceType: input.reference?.type ?? null,
          referenceFolio: input.reference?.folio ?? null,
          referenceDate: input.reference?.date
            ? new Date(input.reference.date)
            : null,
          referenceCode: input.reference?.code ?? null,
          referenceReason: input.reference?.reason ?? null,
          // Referencias adicionales (OC, HES, Contrato, etc) como JSON.
          // Cast a `any` porque el tipo InputJsonValue de Prisma es muy
          // estricto y no acepta arrays tipados directamente; el shape ya
          // está validado en el schema Zod del endpoint.
          additionalReferences:
            input.additionalReferences && input.additionalReferences.length > 0
              ? (input.additionalReferences as any)
              : undefined,
          // XML firmado del DTE (devuelto por el provider). Se persiste
          // para poder regenerar el PDF sin re-emitir contra el SII.
          // Buffer es Uint8Array en runtime; el cast es solo para satisfacer
          // el tipo estricto de Prisma (Bytes? = Uint8Array | null).
          dteXml: providerResult.signedXml
            ? new Uint8Array(providerResult.signedXml)
            : null,
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
              refuerzoSolicitudId: l.refuerzoSolicitudId ?? null,
            })),
          },
        },
        include: { lines: true },
      });

      return { dte: created, nextFolio: folio };
    },
    { timeout: 30_000 }
  );

  // The journal-entry generation and refuerzo updates below intentionally run
  // OUTSIDE the transaction: the DTE is already issued and persisted, and we
  // don't want long-running side-effects to lock the DTE row.
  const code = dte.code;

  const refuerzoIds = Array.from(
    new Set(
      input.lines
        .map((line) => line.refuerzoSolicitudId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (refuerzoIds.length > 0) {
    const prismaAny = prisma as unknown as {
      opsRefuerzoSolicitud?: {
        updateMany: (args: unknown) => Promise<unknown>;
      };
    };
    if (prismaAny.opsRefuerzoSolicitud) {
      await prismaAny.opsRefuerzoSolicitud.updateMany({
        where: { tenantId, id: { in: refuerzoIds } },
        data: {
          status: "facturado",
          invoiceNumber: String(nextFolio),
          invoiceRef: code,
          invoicedAt: new Date(),
        },
      });
    }

    // Mark pending billable items as invoiced
    try {
      await prisma.financePendingBillableItem.updateMany({
        where: {
          tenantId,
          sourceType: "refuerzo",
          sourceId: { in: refuerzoIds },
          status: "pending",
        },
        data: {
          status: "invoiced",
          invoicedDteId: dte.id,
          invoicedAt: new Date(),
        },
      });
    } catch (e) {
      console.error("[FINANCE] Error marking pending billable items as invoiced:", e);
    }
  }

  // 10. Auto-send email to receiver if requested and address is available.
  // Fire-and-forget: a failure here shouldn't fail the emission flow.
  if (input.autoSendEmail !== false && dte.receiverEmail) {
    sendDteEmail(tenantId, dte.id).catch((err) => {
      console.error(`[FINANCE] Auto-send email failed for DTE ${dte.id}:`, err);
    });
  }

  // 11. Auto-generate journal entry for facturas (not boletas)
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

  const provider = await getDteProvider(tenantId);
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
