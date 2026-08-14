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
import { cleanRut, toSiiRut } from "@/lib/chile-rut";
import { createEntryForDte } from "../accounting/accounting-health.service";
import { notify } from "@/lib/notifications/notify";
import { reserveNextFolio } from "./folio-tracker.service";
import { sendDteEmail, sendDteXmlToBackoffice } from "./dte-email.service";
import {
  enrichDteEmailRecipientsFromCrm,
  normalizeAdditionalReferencesForSii,
} from "./dte-xml-compliance";
import {
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";
import { listClosedV3Weeks } from "@/modules/finance/flow-v3/weekly-close.adapter";
import { weekLabel, weekStartYmd, ymdToDate } from "@/modules/finance/flow-v3/weeks";
import {
  applyTemplateLinkInheritance,
  countActiveAccountTemplates,
} from "./inherit-template-link";
import { resolveIssuedDueDate } from "./dte-due-date";

/** Resuelve YYYY-MM-DD de emisión: body explícito o hoy en Chile (no UTC servidor). */
function resolveIssueDateYmd(input: IssueDteInput): string {
  const raw = input.issueDate?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayChileStr();
}

/**
 * Emisión con fecha futura bloqueada hasta confirmación explícita.
 * El cliente ofrece "Emitir con fecha de hoy" (default) o "Mantener {fecha}".
 */
export class FutureIssueDateError extends Error {
  readonly code = "FUTURE_ISSUE_DATE" as const;
  readonly issueDate: string;
  readonly todayYmd: string;

  constructor(issueDate: string, todayYmd: string) {
    super(
      `La fecha de emisión ${issueDate} es posterior a hoy (${todayYmd}). Confirmá para emitir con fecha de hoy o mantener la fecha futura.`,
    );
    this.name = "FutureIssueDateError";
    this.issueDate = issueDate;
    this.todayYmd = todayYmd;
  }
}

/**
 * Emisión con fecha en semana sellada o pasada: aviso + confirmación.
 * Default: emitir con fecha de hoy. Alternativa: mantener la fecha.
 */
export class AnchoredIssueDateError extends Error {
  readonly code = "ANCHORED_ISSUE_DATE" as const;
  readonly issueDate: string;
  readonly todayYmd: string;
  readonly weekLabel: string;
  readonly reason: "sealed" | "past";

  constructor(args: {
    issueDate: string;
    todayYmd: string;
    weekLabel: string;
    reason: "sealed" | "past";
  }) {
    const reasonTxt = args.reason === "sealed" ? "sellada" : "pasada";
    super(
      `La fecha de emisión ${args.issueDate} quedará anclada en ${args.weekLabel} (${reasonTxt}). Confirmá para emitir con fecha de hoy o mantener ${args.issueDate}.`,
    );
    this.name = "AnchoredIssueDateError";
    this.issueDate = args.issueDate;
    this.todayYmd = args.todayYmd;
    this.weekLabel = args.weekLabel;
    this.reason = args.reason;
  }
}

export type IssueDteInput = {
  /** Fecha de emisión tributaria YYYY-MM-DD (SII). Default: hoy en Chile. */
  issueDate?: string;
  /**
   * Vencimiento YYYY-MM-DD. Si no viene, se calcula con `resolveDueDate`
   * (término del contrato → default del tenant → 30 días). El SII no lo
   * lleva en el XML: es dato interno de cobranza.
   */
  dueDate?: string | null;
  /** Término de pago en días — gana sobre el del contrato/tenant si `dueDate` no vino. */
  dueDays?: number | null;
  dteType: number;
  receiverRut: string;
  receiverName: string;
  /**
   * Email primario del receptor — el único que va al XML SII como
   * <CorreoRecep>. Si querés enviar copia a más gente, usa
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
  /**
   * Vínculo con programación (dedupe period-aware del flujo).
   * undefined = heredar si la cuenta tiene una sola programación activa;
   * null = factura EXTRA (sin cuota).
   */
  recurringTemplateId?: string | null;
  /** Período facturado YYYY-MM. Acompaña a recurringTemplateId. */
  billingPeriod?: string | null;
  /**
   * Destino explícito en planilla de flujo (factura puntual).
   * null/undefined = ruteo automático. Si viene flowExclusionReason, se fuerza null.
   */
  flowRouting?: "OWN_ROW" | "OTHER_INCOME" | null;
  /**
   * Motivo para excluir del flujo post-emisión (best-effort, no revierte la emisión).
   * Mutuamente excluyente con flowRouting.
   */
  flowExclusionReason?: string;
};

/** Solo filas con folio y fecha YYYY-MM-DD válida van al XML SII.
 *  Normaliza HES→802 y GD→52 (portales SAP / casillas DTE). */
function additionalReferencesForSii(
  refs: IssueDteInput["additionalReferences"] | undefined,
): NonNullable<IssueDteInput["additionalReferences"]> {
  return normalizeAdditionalReferencesForSii(refs);
}

const DTE_TYPES_REQUIRING_REFERENCE = [56, 61] as const;

export type IssueDteOpts = {
  /** UF a usar en lugar de la del día. */
  ufOverride?: number;
  /**
   * Si la fecha de emisión es > hoy o cae en semana sellada/pasada:
   * reescribe a hoy (opción por defecto del diálogo de confirmación).
   */
  forceIssueDateToToday?: boolean;
  /**
   * Si la fecha de emisión es > hoy: permite emitir con esa fecha
   * (opción secundaria "Mantener {fecha}").
   */
  allowFutureDate?: boolean;
  /**
   * Si la fecha cae en semana sellada/pasada: permite emitir con esa fecha
   * (opción secundaria "Mantener {fecha}").
   */
  allowAnchoredDate?: boolean;
  /**
   * Si false, no intentar exclusión del flujo aunque venga flowExclusionReason
   * (emisor sin capability cashflow_manage).
   */
  canExcludeFromFlow?: boolean;
};

/**
 * Issue a new DTE (factura, boleta, etc.)
 *
 * `opts.ufOverride` permite usar un valor de UF distinto al del día (lo
 * propaga a `computeDteAmounts` y se persiste en `ufValueAtIssue`). Útil
 * cuando el usuario emite con la UF que pactó con el cliente y no con la
 * oficial del día.
 *
 * Fechas futuras: sin `forceIssueDateToToday` ni `allowFutureDate` lanza
 * `FutureIssueDateError` — nunca se envía al SII una FchEmis futura en
 * silencio.
 */
export async function issueDte(
  tenantId: string,
  createdBy: string,
  input: IssueDteInput,
  opts?: IssueDteOpts,
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

  // 2a. Canonicalizar el RUT receptor ANTES de persistir/matchear. La
  // ingesta de DTE recibido ya lo hace (rutCanonical); la emisión guardaba
  // `receiverRut` crudo — si traía un carácter invisible del XML/portapapeles
  // (zero-width, BOM, etc.) el string se veía idéntico al RUT de la cuenta
  // CRM pero no calzaba en igualdad exacta → el DTE quedaba sin vincular.
  // toSiiRut deja el formato `<cuerpo>-<dv>` (mismo que persisten los
  // recibidos y el que exige el SII).
  input.receiverRut = toSiiRut(input.receiverRut);

  // 2b. Auto-link CrmAccount por RUT cuando el caller no lo provee.
  // Antes el frontend tenía que mandar crmAccountId explícitamente y muchas
  // emisiones quedaban sin vincular — el detalle del DTE mostraba "Sin
  // asignar" aunque el cliente CRM existía. Prisma no normaliza en el `where`,
  // así que traemos las cuentas candidatas del tenant y matcheamos en JS con
  // `cleanRut` (solo dígitos+K) — tolera invisibles/formato en AMBOS lados,
  // incluida una cuenta cuyo rut esté sucio en la BD.
  if (!input.crmAccountId) {
    const receiverKey = cleanRut(input.receiverRut);
    if (receiverKey) {
      const candidates = await prisma.crmAccount.findMany({
        where: { tenantId, rut: { not: null } },
        select: { id: true, rut: true },
      });
      const match = candidates.find((a) => cleanRut(a.rut ?? "") === receiverKey);
      if (match) input.crmAccountId = match.id;
    }
  }

  // 2c. Enrutar email PDF+XML a la casilla DTE del CRM (si existe) y
  // sumar contactos con recibeFacturacion. Afecta CorreoRecep del XML,
  // receiverEmail/Cc persistidos y el auto-send. Regla general (no
  // hardcodeada a un cliente): detecta emails tipo recepciondte*.
  if (input.crmAccountId) {
    const routed = await enrichDteEmailRecipientsFromCrm({
      tenantId,
      crmAccountId: input.crmAccountId,
      currentTo: input.receiverEmail,
      currentCc: input.receiverEmailCc,
    });
    if (routed.adjusted) {
      input.receiverEmail = routed.to ?? input.receiverEmail;
      input.receiverEmailCc = routed.cc;
      console.info(
        `[FINANCE] DTE email routing adjusted for account ${input.crmAccountId}: TO=${input.receiverEmail ?? "(none)"} CC=${routed.cc.length}`,
      );
    }
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
  const requestedIssueYmd = resolveIssueDateYmd(input);
  let emissionYmd = requestedIssueYmd;
  const todayYmd = todayChileStr();
  if (emissionYmd > todayYmd) {
    if (opts?.forceIssueDateToToday) {
      emissionYmd = todayYmd;
      input.issueDate = todayYmd;
    } else if (!opts?.allowFutureDate) {
      throw new FutureIssueDateError(emissionYmd, todayYmd);
    }
  } else if (emissionYmd < todayYmd && !opts?.forceIssueDateToToday && !opts?.allowAnchoredDate) {
    // v4.7: fecha en semana sellada o pasada → confirmación (default: hoy).
    const issueWeek = weekStartYmd(ymdToDate(emissionYmd) ?? new Date());
    const currentWeek = weekStartYmd(ymdToDate(todayYmd) ?? new Date());
    const sealed = await listClosedV3Weeks(tenantId, [issueWeek]);
    const isSealed = sealed.includes(issueWeek);
    const isPastWeek = issueWeek < currentWeek;
    if (isSealed || isPastWeek) {
      throw new AnchoredIssueDateError({
        issueDate: emissionYmd,
        todayYmd,
        weekLabel: weekLabel(issueWeek),
        reason: isSealed ? "sealed" : "past",
      });
    }
  }
  if (opts?.forceIssueDateToToday && emissionYmd !== todayYmd) {
    emissionYmd = todayYmd;
    input.issueDate = todayYmd;
  }
  let emissionDbDate: Date;
  try {
    emissionDbDate = parseYmdToDbDate(emissionYmd);
  } catch {
    throw new Error(
      `Fecha de emisión inválida: "${input.issueDate ?? ""}". Usa formato YYYY-MM-DD.`,
    );
  }

  // Vínculo programación + período (flujo de caja). Hereda si la cuenta tiene
  // una sola programación activa y el caller no declaró el campo.
  const templateLink = await applyTemplateLinkInheritance(tenantId, {
    dteType: input.dteType,
    crmAccountId: input.crmAccountId,
    installationId: input.installationId,
    issueDateYmd: emissionYmd,
    recurringTemplateId: input.recurringTemplateId,
    billingPeriod: input.billingPeriod,
  });

  // Vencimiento: respeta el explícito del caller (borrador o form) y si no
  // lo hay lo deriva del término de pago del contrato / tenant. Las NC (61)
  // nacen PAID y no se cobran, así que quedan sin vencimiento.
  // Si la fecha de emisión se reescribió (forceIssueDateToToday), el
  // vencimiento pactado ya no corresponde: se recalcula sobre la nueva fecha.
  const dueDbDate = await resolveIssuedDueDate({
    tenantId,
    dteType: input.dteType,
    emissionYmd,
    explicitDueDate: emissionYmd === requestedIssueYmd ? input.dueDate : null,
    explicitDays: input.dueDays,
    recurringTemplateId: templateLink.recurringTemplateId,
  });

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
          dueDate: dueDbDate,
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
          // Vínculo programación + período (dedupe del flujo).
          recurringTemplateId: templateLink.recurringTemplateId,
          billingPeriod: templateLink.billingPeriod,
          // Destino explícito en planilla. Exclusión (motivo) fuerza null.
          flowRouting: input.flowExclusionReason
            ? null
            : (input.flowRouting ?? null),
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

  // v4.7: huérfana post-emisión → el cliente muestra banner "Vincular ahora".
  // Con destino explícito (OWN_ROW / OTHER_INCOME / exclusión) no se pide vínculo.
  let needsTemplateLink = false;
  const hasExplicitFlowDecision =
    !!input.flowExclusionReason ||
    input.flowRouting === "OWN_ROW" ||
    input.flowRouting === "OTHER_INCOME";
  if (
    (input.dteType === 33 || input.dteType === 34) &&
    !templateLink.recurringTemplateId &&
    input.crmAccountId &&
    !hasExplicitFlowDecision
  ) {
    const n = await countActiveAccountTemplates(tenantId, input.crmAccountId);
    needsTemplateLink = n >= 1;
  }

  // Exclusión del flujo post-commit (best-effort: no revierte la emisión SII).
  let flowExclusion: { applied: boolean; error?: string } | undefined;
  if (input.flowExclusionReason) {
    if (opts?.canExcludeFromFlow === false) {
      flowExclusion = {
        applied: false,
        error: "Sin permiso para excluir del flujo de caja",
      };
    } else {
      try {
        const { excludeDteFromFlow } = await import(
          "@/modules/finance/cashflow/dte-exclusion.service"
        );
        await excludeDteFromFlow({
          tenantId,
          dteId: dte.id,
          createdBy,
          reason: input.flowExclusionReason.trim().slice(0, 300),
        });
        flowExclusion = { applied: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al excluir del flujo";
        console.error(
          `[FINANCE] flow exclusion failed for DTE ${dte.id}: ${msg}`,
        );
        flowExclusion = { applied: false, error: msg };
      }
    }
  }

  return Object.assign(dte, { emailStatus, emailError, needsTemplateLink, flowExclusion });
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
