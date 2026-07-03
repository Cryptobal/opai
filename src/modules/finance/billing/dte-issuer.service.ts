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
import { createEntryForDte } from "../accounting/accounting-health.service";
import { notify } from "@/lib/notifications/notify";
import { reserveNextFolio } from "./folio-tracker.service";
import { sendDteEmail, sendDteXmlToBackoffice } from "./dte-email.service";
import {
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";

/** Resuelve YYYY-MM-DD de emisión: body explícito o hoy en Chile (no UTC servidor). */
function resolveIssueDateYmd(input: IssueDteInput): string {
  const raw = input.issueDate?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayChileStr();
}

export type IssueDteInput = {
  /** Fecha de emisión tributaria YYYY-MM-DD (SII). Default: hoy en Chile. */
  issueDate?: string;
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
   * Lista de emails BCC para el envío externo. No va al XML SII ni
   * queda persistido en FinanceDte (efímero por emisión).
   */
  receiverEmailBcc?: string[];
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
   * Filas solo con tipo (sin folio/fecha) se persisten en BD como
   * recordatorio; al armar el XML solo se envían las completas.
   */
  additionalReferences?: Array<{
    tipoDocRef: string;
    folioRef: string;
    fchRef: string;
    razonRef: string;
  }>;
};

/** Solo filas con folio y fecha YYYY-MM-DD válida van al XML SII. */
function additionalReferencesForSii(
  refs: IssueDteInput["additionalReferences"] | undefined,
): NonNullable<IssueDteInput["additionalReferences"]> {
  if (!refs?.length) return [];
  const out: NonNullable<IssueDteInput["additionalReferences"]> = [];
  for (const r of refs) {
    const folio = (r.folioRef ?? "").trim();
    const fch = (r.fchRef ?? "").trim();
    if (folio && /^\d{4}-\d{2}-\d{2}$/.test(fch)) {
      out.push({
        tipoDocRef: r.tipoDocRef,
        folioRef: folio,
        fchRef: fch,
        razonRef: (r.razonRef ?? "").trim(),
      });
    }
  }
  return out;
}

const DTE_TYPES_REQUIRING_REFERENCE = [56, 61] as const;

/**
 * Issue a new DTE (factura, boleta, etc.)
 *
 * `opts.ufOverride` permite usar un valor de UF distinto al del día (lo
 * propaga a `computeDteAmounts` y se persiste en `ufValueAtIssue`). Útil
 * cuando el usuario emite con la UF que pactó con el cliente y no con la
 * oficial del día.
 */
export async function issueDte(
  tenantId: string,
  createdBy: string,
  input: IssueDteInput,
  opts?: { ufOverride?: number },
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

  // 2b. Auto-link CrmAccount por RUT cuando el caller no lo provee.
  // Antes el frontend tenía que mandar crmAccountId explícitamente y muchas
  // emisiones quedaban sin vincular — el detalle del DTE mostraba "Sin
  // asignar" aunque el cliente CRM existía. Si encontramos match por RUT
  // lo asignamos; si no, queda null como antes.
  if (!input.crmAccountId) {
    const match = await prisma.crmAccount.findFirst({
      where: { tenantId, rut: input.receiverRut },
      select: { id: true },
    });
    if (match) input.crmAccountId = match.id;
  }

  // 3-4. Calcular líneas, IVA, total. Si currency=UF, convierte cada
  // unitPriceUf → unitPrice CLP usando la UF del día (vía FxUfRate).
  // El XML SII y el asiento contable van SIEMPRE en CLP — la UF queda
  // como auditoría en ufValueAtIssue + line.unitPriceUf.
  //
  // strict=true: en emisión real rechazamos unitPrice CLP con decimales
  // (que provocaba el bug del "1.000.000 quedó en 999.998"). Si llega
  // un input con decimales, throw temprano con mensaje claro.
  const calc = await computeDteAmounts(input, {
    strict: true,
    ufOverride: opts?.ufOverride,
  });
  const totalNet = calc.totalNet;
  const totalExempt = calc.totalExempt;
  const taxRate = calc.taxRate;
  const taxAmount = calc.taxAmount;
  const totalAmount = calc.totalAmount;
  const calculatedLines = calc.lines;
  const ufValueAtIssue = calc.ufValue;
  const ufDateAtIssue = calc.ufDate;
  const emissionYmd = resolveIssueDateYmd(input);
  let emissionDbDate: Date;
  try {
    emissionDbDate = parseYmdToDbDate(emissionYmd);
  } catch {
    throw new Error(
      `Fecha de emisión inválida: "${input.issueDate ?? ""}". Usá formato YYYY-MM-DD.`,
    );
  }

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
      const siiAdditionalRefs = additionalReferencesForSii(input.additionalReferences);
      const dteRequest: DteIssueRequest = {
        dteType: input.dteType,
        folio,
        date: emissionYmd,
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
        ...(siiAdditionalRefs.length > 0
          ? { additionalReferences: siiAdditionalRefs }
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
          date: emissionDbDate,
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
          // Las NCs (61) nacen fuera del flujo de cobranza: no se cobran
          // (son contra-asiento de una factura ya emitida). Las marcamos
          // PAID con saldo=0 para que NUNCA aparezcan en filtros de
          // Pendiente/Vencido. Resto: estado normal UNPAID con saldo.
          paymentStatus: input.dteType === 61 ? "PAID" : "UNPAID",
          amountPaid: input.dteType === 61 ? totalAmount : 0,
          amountPending: input.dteType === 61 ? 0 : totalAmount,
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

  // 10. Auto-send email to receiver. Antes era fire-and-forget; el problema
  // es que cuando fallaba (Resend caído, dominio sin verificar, attachment
  // bounce) el frontend no se enteraba y el usuario creía que el email
  // había salido. Ahora awaiteamos y reportamos el resultado en
  // `emailStatus` / `emailError` para que la UI muestre un toast acorde.
  let emailStatus: "sent" | "failed" | "no_receiver" | "skipped" = "skipped";
  let emailError: string | null = null;
  // Hay destinatario si el DTE tiene receiverEmail (TO) O al menos un CC
  // válido. sendDteEmail promueve el primer CC a TO cuando no hay receiverEmail,
  // así que con sólo CC el correo igual sale. No marcamos no_receiver en ese caso.
  const effectiveCc = input.receiverEmailCc ?? dte.receiverEmailCc ?? [];
  const hasAnyRecipient =
    !!dte.receiverEmail?.trim() ||
    effectiveCc.some((e) => typeof e === "string" && e.trim());
  if (input.autoSendEmail === false) {
    emailStatus = "skipped";
  } else if (!hasAnyRecipient) {
    emailStatus = "no_receiver";
  } else {
    try {
      const r = await sendDteEmail(
        tenantId,
        dte.id,
        undefined,                       // recipientEmail: usa dte.receiverEmail ya persistido
        input.receiverEmailCc,           // ccOverride explícito (cae a dte.receiverEmailCc si es undefined)
        "AUTO_RECEIVER",
        createdBy,
        input.receiverEmailBcc,          // bccOverride efímero
      );
      if (r.success) {
        emailStatus = "sent";
      } else {
        emailStatus = "failed";
        emailError = r.error ?? "Error desconocido al enviar email";
        console.error(`[FINANCE] Auto-send email failed for DTE ${dte.id}: ${emailError}`);
      }
    } catch (err) {
      emailStatus = "failed";
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`[FINANCE] Auto-send email threw for DTE ${dte.id}:`, err);
    }
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
      kindOverride: "AUTO_BACKOFFICE",
    }).catch((err) => {
      console.error(`[FINANCE] Auto-send backoffice XML failed for DTE ${dte.id}:`, err);
    });
  }

  // 10c. Vincular DTE a una occurrence proyectada del flujo de caja
  // (best-effort, fuera de transacción y no bloqueante). Esto cubre la
  // emisión DIRECTA — antes el matcher sólo corría en createDraft/
  // issueDraft, por lo que facturas emitidas sin pasar por borrador
  // nunca se vinculaban a la proyección.
  //
  // Auto-match al item de contrato. El matcher mismo aplica el skip
  // de NC/ND (56/61) internamente — defense in depth. Acá no
  // duplicamos el guard.
  try {
    const { matchDraftToOccurrence } = await import(
      "@/modules/finance/cashflow/draft-occurrence-matcher.service"
    );
    await matchDraftToOccurrence({
      tenantId,
      dteId: dte.id,
      crmAccountId: input.crmAccountId ?? null,
      installationId: input.installationId ?? null,
      expectedDate: emissionDbDate,
      amountClp: Number(totalAmount),
    });
  } catch (err) {
    console.error(
      "[dte-issuer] auto-match cashflow falló (no bloqueante):",
      err,
    );
  }

  // 11. Auto-generate journal entry for facturas (not boletas). Reutiliza la
  // función canónica createEntryForDte (misma que repara huérfanos). Sigue
  // siendo best-effort: no falla la emisión si el asiento falla — pero ahora
  // el fallo NUNCA es invisible: además del log, se notifica al equipo
  // contable para que lo repare desde "Salud del período".
  if (input.dteType === 33 || input.dteType === 34) {
    const entryResult = await createEntryForDte(tenantId, dte.id, createdBy);
    if (entryResult.status === "failed") {
      console.error(
        `Auto-entry failed for DTE ${dte.id} (folio ${nextFolio}): ${entryResult.error}`,
      );
      notify({
        tenantId,
        type: "accounting_entry_failed",
        title: `Factura #${nextFolio} sin asiento contable`,
        body: `No se pudo generar el asiento de la factura #${nextFolio} (${input.receiverName}). Genera el asiento faltante desde Contabilidad → Salud del período.`,
        link: `/finanzas/contabilidad`,
        data: { dteId: dte.id, folio: nextFolio, error: entryResult.error },
      }).catch((err) =>
        console.error("[dte-issuer] notify accounting_entry_failed falló:", err),
      );
    }
  }

  return Object.assign(dte, { emailStatus, emailError });
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
  const isAccepted =
    status.status === "ACCEPTED" || status.status === "WITH_OBJECTIONS";
  await prisma.financeDte.update({
    where: { id: dteId },
    data: {
      siiStatus: status.status as any,
      siiResponse: status.rawResponse as any ?? null,
      // No clobberear un siiAcceptedAt previo con null en re-consultas.
      siiAcceptedAt: isAccepted ? (dte.siiAcceptedAt ?? new Date()) : dte.siiAcceptedAt,
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
