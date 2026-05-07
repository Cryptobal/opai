/**
 * DTE Issuer Service
 * Orchestrates the DTE issuance flow: validate, calculate, issue, store, auto-entry
 */

import { prisma } from "@/lib/prisma";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import type { DteIssueRequest, DteLineItem } from "../shared/adapters/dte-provider.adapter";
import { isDteTypeValid } from "../shared/constants/dte-types";
import { computeDteAmounts } from "./dte-amounts.helper";
import { validateRut } from "../shared/validators/rut.validator";
import { buildInvoiceIssuedEntry } from "../accounting/auto-entry.builder";
import { createManualEntry, postEntry } from "../accounting/journal-entry.service";
import { reserveNextFolio } from "./folio-tracker.service";
import { sendDteEmail, sendDteXmlToBackoffice } from "./dte-email.service";

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
  /**
   * Datos del receptor que el SII exige en facturas (tipo 33).
   * Si no vienen, el provider usa defaults razonables.
   */
  receiverGiro?: string;
  receiverDireccion?: string;
  receiverComuna?: string;
  receiverCiudad?: string;
  /** Centros de costo: vincular DTE al cliente CRM e instalación. */
  crmAccountId?: string;
  installationId?: string;
  lines: {
    itemCode?: string;
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    /**
     * Precio en UF cuando currency="UF". El servicio convierte a CLP con
     * la UF del día y guarda ambos. Para CLP queda undefined.
     */
    unitPriceUf?: number;
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
   * Si true, además del email al receptor (PDF+XML), envía un email
   * SOLO con el XML adjunto a los destinatarios de backoffice (contador
   * externo) configurados en TenantDteConfig.defaultXmlRecipientEmails.
   * Si null/undefined, se aplica el default del tenant
   * (defaultXmlRecipientAlwaysSend).
   */
  sendXmlToBackoffice?: boolean;
  /** Override de los destinatarios de backoffice. Si vacío, usa el default del tenant. */
  backofficeEmailsOverride?: string[];
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

  // 3-4. Calcular líneas, IVA, total. Si currency=UF, convierte cada
  // unitPriceUf → unitPrice CLP usando la UF del día (vía FxUfRate).
  // El XML SII y el asiento contable van SIEMPRE en CLP — la UF queda
  // como auditoría en ufValueAtIssue + line.unitPriceUf.
  //
  // strict=true: en emisión real rechazamos unitPrice CLP con decimales
  // (que provocaba el bug del "1.000.000 quedó en 999.998"). Si llega
  // un input con decimales, throw temprano con mensaje claro.
  const calc = await computeDteAmounts(input, { strict: true });
  const totalNet = calc.totalNet;
  const totalExempt = calc.totalExempt;
  const taxRate = calc.taxRate;
  const taxAmount = calc.taxAmount;
  const totalAmount = calc.totalAmount;
  const calculatedLines = calc.lines;
  const ufValueAtIssue = calc.ufValue;
  const ufDateAtIssue = calc.ufDate;

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
        // Datos del receptor que el SII exige (giro/dir/comuna/ciudad).
        // Si no vienen, el provider usa defaults seguros.
        receiverGiro: input.receiverGiro,
        receiverDireccion: input.receiverDireccion,
        receiverComuna: input.receiverComuna,
        receiverCiudad: input.receiverCiudad,
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

      // Garantía multi-tenant: el XML firmado SIEMPRE debe persistirse
      // en BD del tenant para poder regenerar PDF, ceder a factoring o
      // reauditar. Si falta, abortamos para mantener el invariante "todo
      // DTE emitido tiene su XML almacenado".
      if (!providerResult.signedXml || providerResult.signedXml.length === 0) {
        throw new Error(
          "Provider devolvió éxito pero sin XML firmado — no se puede persistir el DTE. Revisar logs del provider.",
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
          // Datos completos del receptor (para auditoría y reimpresión).
          receiverGiro: input.receiverGiro ?? null,
          receiverDireccion: input.receiverDireccion ?? null,
          receiverComuna: input.receiverComuna ?? null,
          receiverCiudad: input.receiverCiudad ?? null,
          // Centros de costo: cliente CRM e instalación.
          crmAccountId: input.crmAccountId ?? null,
          installationId: input.installationId ?? null,
          currency: (input.currency as any) ?? "CLP",
          // Para facturas en UF guardamos también la UF del día y la
          // fecha exacta de conversión. exchangeRate replica ufValueAtIssue
          // (legacy field). Permite reauditar y regenerar reportes.
          exchangeRate: ufValueAtIssue ?? null,
          ufValueAtIssue: ufValueAtIssue ?? null,
          ufDateAtIssue: ufDateAtIssue ?? null,
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
          // SIEMPRE — el guard previo aborta si viene vacío, así que acá
          // confiamos en que existe. Permite regenerar PDF, ceder a
          // factoring y reauditar sin re-emitir contra el SII.
          dteXml: new Uint8Array(providerResult.signedXml),
          lines: {
            create: calculatedLines.map((l, i) => ({
              lineNumber: i + 1,
              itemCode: l.itemCode ?? null,
              itemName: l.itemName,
              description: l.description ?? null,
              quantity: l.quantity,
              unit: l.unit ?? null,
              unitPrice: l.unitPrice,
              // Si la moneda del DTE es UF, persiste el precio UF original
              // que el usuario ingresó. Para CLP queda null.
              unitPriceUf: input.currency === "UF" ? l.unitPriceUf ?? null : null,
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
    sendDteEmail(tenantId, dte.id, undefined, undefined, "auto_receiver", createdBy).catch(
      (err) => {
        console.error(`[FINANCE] Auto-send email failed for DTE ${dte.id}:`, err);
      },
    );
  }

  // 10b. Auto-send XML to backoffice if configured at tenant level OR
  // explicitly requested. Default-on para facturación rutinaria con
  // contador externo. Fire-and-forget al igual que el auto-receiver.
  const cfg = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
  const shouldSendXml =
    input.sendXmlToBackoffice === true ||
    (input.sendXmlToBackoffice !== false && cfg?.defaultXmlRecipientAlwaysSend === true);
  if (shouldSendXml && (cfg?.defaultXmlRecipientEmails.length ?? 0) > 0) {
    sendDteXmlToBackoffice(tenantId, dte.id, {
      emailsOverride: input.backofficeEmailsOverride,
      triggeredBy: createdBy,
      kindOverride: "auto_backoffice",
    }).catch((err) => {
      console.error(`[FINANCE] Auto-send backoffice XML failed for DTE ${dte.id}:`, err);
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
  const previousStatus = dte.siiStatus;
  await prisma.financeDte.update({
    where: { id: dteId },
    data: {
      siiStatus: status.status as any,
      siiResponse: status.rawResponse as any ?? null,
      siiAcceptedAt: status.status === "ACCEPTED" ? new Date() : null,
      siiLastStatusCheckAt: new Date(),
      siiStatusCheckCount: { increment: 1 },
    },
  });

  // Disparar alerta si el DTE pasó a REJECTED (transición desde otro estado).
  if (status.status === "REJECTED" && previousStatus !== "REJECTED") {
    const { sendDteRejectedAlert } = await import("./dte-rejected-alert.service");
    sendDteRejectedAlert(tenantId, dteId).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[checkDteStatus] sendDteRejectedAlert failed for ${dteId}:`,
        err,
      );
    });
  }

  return status;
}
