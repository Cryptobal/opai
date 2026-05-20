/**
 * Billing Document Send Service
 *
 * Genera el PDF de la variante (Proforma / Estado de Pago) y lo envía por
 * email al receptor con plantilla branded del tenant. Persiste estado en
 * `FinanceDte.proformaStatus` y log en `FinanceDteEmailLog`.
 *
 * NO toca SimpleAPI / SII. NO emite folio. Solo es envío externo.
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildBillingDocProps } from "@/lib/pdf/templates/billing-doc/build-billing-doc-props";
import { renderBillingDocPdf } from "@/lib/pdf/templates/billing-doc/render-billing-doc";
import { resolveBrandColors } from "@/modules/finance/billing/billing-doc-config.service";
import { render } from "@react-email/render";
import { createElement } from "react";
import { BillingDocumentEmail } from "@/emails/BillingDocumentEmail";

export type BillingDocVariant = "PROFORMA" | "ESTADO_DE_PAGO";

export type BillingDocEmailKind =
  | "proforma_sent"
  | "estado_pago_sent"
  | "proforma_failed"
  | "estado_pago_failed";

export interface SendBillingDocumentInput {
  dteId: string;
  variant: BillingDocVariant;
  /** Override del destinatario primario. Default: contactoEstadoPago.email. */
  recipientEmail?: string | null;
  ccEmails?: string[];
  bccEmails?: string[];
  /** Override del subject. Si null, usa plantilla del tenant o default. */
  customSubject?: string | null;
  /** HTML sanitizado del intro custom. */
  customIntroHtml?: string | null;
  signerOverrides?: string[];
  triggeredBy: string;
  /**
   * Si true, el envío fue disparado por el cron de facturación recurrente
   * (no por una acción manual del usuario). Determina el `kind` del log:
   *   - true  → AUTO_PROFORMA / AUTO_ESTADO_PAGO
   *   - false → MANUAL_PROFORMA / MANUAL_ESTADO_PAGO (default)
   */
  isAutoFromCron?: boolean;
}

export interface SendBillingDocumentResult {
  success: boolean;
  messageId?: string;
  error?: string;
  pdfBytes?: number;
}

const DEFAULT_PROFORMA_SUBJECT = "Proforma {{folio}} - {{razonSocial}}";
const DEFAULT_ESTADO_PAGO_SUBJECT =
  "Estado de Pago {{periodo}} - {{razonSocial}}";

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return vars[k] ?? `{{${k}}}`;
  });
}

/** Mapea la variante + origen (cron vs manual) a los enum values de BD. */
function variantToKinds(variant: BillingDocVariant): {
  successKind: BillingDocEmailKind;
  failKind: BillingDocEmailKind;
} {
  return variant === "PROFORMA"
    ? { successKind: "proforma_sent", failKind: "proforma_failed" }
    : { successKind: "estado_pago_sent", failKind: "estado_pago_failed" };
}

async function logEmail(
  tenantId: string,
  dteId: string,
  data: {
    kind: BillingDocEmailKind;
    isAutoFromCron: boolean;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    status: "sent" | "failed";
    resendId?: string | null;
    errorMessage?: string | null;
    sentBy: string;
  },
) {
  const isProforma =
    data.kind === "proforma_sent" || data.kind === "proforma_failed";
  const enumKind: "AUTO_PROFORMA" | "AUTO_ESTADO_PAGO" | "MANUAL_PROFORMA" | "MANUAL_ESTADO_PAGO" =
    data.isAutoFromCron
      ? isProforma
        ? "AUTO_PROFORMA"
        : "AUTO_ESTADO_PAGO"
      : isProforma
        ? "MANUAL_PROFORMA"
        : "MANUAL_ESTADO_PAGO";

  try {
    await prisma.financeDteEmailLog.create({
      data: {
        tenantId,
        dteId,
        kind: enumKind,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject || `(${data.kind} — sin asunto resuelto)`,
        attachments: "PDF_ONLY",
        status: data.status === "sent" ? "SENT" : "FAILED",
        resendId: data.resendId ?? null,
        errorMessage: data.errorMessage ?? null,
        sentBy: data.sentBy,
      },
    });
  } catch (err) {
    console.error("[billing/email-log] Failed to persist log:", err);
  }
}

export async function sendBillingDocument(
  tenantId: string,
  input: SendBillingDocumentInput,
): Promise<SendBillingDocumentResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: input.dteId, tenantId, direction: "ISSUED" },
  });
  if (!dte) return { success: false, error: "DTE no encontrado" };

  // CrmAccount con contacto_estado_pago + primer contacto activo (separate
  // query porque FinanceDte no tiene la relación declarada al CrmAccount).
  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId },
        include: {
          contactoEstadoPago: true,
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      })
    : null;

  // Reglas de negocio según variante.
  if (input.variant === "PROFORMA" && dte.siiStatus !== "DRAFT") {
    const { failKind } = variantToKinds(input.variant);
    const errorMsg =
      "No se puede enviar proforma de un DTE ya emitido. Para reenviar el DTE, usar 'Reenviar email'.";
    await logEmail(tenantId, input.dteId, {
      kind: failKind,
      isAutoFromCron: input.isAutoFromCron ?? false,
      to: [],
      cc: [],
      bcc: [],
      subject: "(envío no intentado: DTE ya emitido)",
      status: "failed",
      errorMessage: errorMsg,
      sentBy: input.triggeredBy,
    });
    return { success: false, error: errorMsg };
  }
  // ESTADO_DE_PAGO se permite siempre (incluye DTEs ya emitidos).

  // ── Resolver destinatarios ──
  // Prioridad:
  //   1. Override explícito en `input.recipientEmail` (modal de envío ad-hoc).
  //   2. Plan persistido en el draft (proformaRecipientContactIds /
  //      estadoPagoRecipientContactIds): si hay contactos seleccionados,
  //      el primero es `primary` y los demás van como CC.
  //   3. CrmAccount.contactoEstadoPago (contacto default por-cliente).
  //   4. Primer contacto activo del CrmAccount.
  //   5. dte.receiverEmail.
  let primary = input.recipientEmail?.trim() || null;
  let planCcEmails: string[] = [];

  if (!primary && account) {
    const planContactIds =
      input.variant === "PROFORMA"
        ? (dte.proformaRecipientContactIds ?? [])
        : (dte.estadoPagoRecipientContactIds ?? []);
    if (planContactIds.length > 0) {
      const planContacts = await prisma.crmContact.findMany({
        where: {
          tenantId,
          accountId: account.id,
          id: { in: planContactIds },
          email: { not: null },
        },
        orderBy: { createdAt: "asc" },
      });
      const emails = planContacts
        .map((c) => c.email!)
        .filter((e) => e && e.trim());
      if (emails.length > 0) {
        primary = emails[0];
        planCcEmails = emails.slice(1);
      }
    }
  }
  if (!primary && account?.contactoEstadoPago?.email) {
    primary = account.contactoEstadoPago.email;
  }
  if (!primary && account?.contacts?.[0]?.email) {
    primary = account.contacts[0].email;
  }
  if (!primary && dte.receiverEmail) {
    primary = dte.receiverEmail;
  }
  if (!primary) {
    const { failKind } = variantToKinds(input.variant);
    const errorMsg =
      "No hay destinatario configurado. Editá el borrador y elegí contactos del cliente en \"Documento de Cobro\".";
    await logEmail(tenantId, input.dteId, {
      kind: failKind,
      isAutoFromCron: input.isAutoFromCron ?? false,
      to: [],
      cc: [],
      bcc: [],
      subject: "(envío no intentado: sin destinatario)",
      status: "failed",
      errorMessage: errorMsg,
      sentBy: input.triggeredBy,
    });
    return { success: false, error: errorMsg };
  }

  // Construir props + renderizar PDF dentro de try/catch para que cualquier
  // error (fuente faltante, logo R2 inaccesible, relación CRM rota) quede
  // registrado en FinanceDteEmailLog en vez de silenciarse o propagar al cron.
  let billingProps;
  let pdfBuffer;
  try {
    billingProps = await buildBillingDocProps(
      tenantId,
      input.dteId,
      input.variant,
      { signerOverrideIds: input.signerOverrides },
    );
    pdfBuffer = await renderBillingDocPdf(billingProps);
  } catch (err) {
    const { failKind } = variantToKinds(input.variant);
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logEmail(tenantId, input.dteId, {
      kind: failKind,
      isAutoFromCron: input.isAutoFromCron ?? false,
      to: [primary],
      cc: [],
      bcc: [],
      subject: "(envío no intentado: error generando PDF)",
      status: "failed",
      errorMessage: `Error generando PDF: ${errorMsg}`,
      sentBy: input.triggeredBy,
    });
    return { success: false, error: `Error generando PDF: ${errorMsg}` };
  }

  // Branding y email config del tenant.
  const tenantConfig = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
  });
  const company = await getTenantCompanyConfig(tenantId);
  const colors = await resolveBrandColors(tenantId);
  const emailCfg = await getTenantEmailConfig(tenantId);

  // Variables comunes para tokens.
  const fmtCurrency = (n: number) =>
    billingProps.totals.currency === "UF"
      ? `${n.toFixed(2)} UF`
      : new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          minimumFractionDigits: 0,
        }).format(n);
  const tokenVars: Record<string, string> = {
    razonSocial: dte.receiverName,
    folio: dte.folio > 0 ? String(dte.folio) : billingProps.document.folio,
    tipo: billingProps.document.dteTypeName,
    total: fmtCurrency(billingProps.totals.totalAmount),
    fecha: billingProps.document.dateFormatted,
    receiverName:
      billingProps.receptor.contactName ?? dte.receiverName,
    numeroOrdenContrato: billingProps.document.numeroOrdenContrato ?? "",
    periodo: billingProps.document.periodoLabel,
  };

  // Subject.
  const subjectTemplate =
    input.customSubject ||
    (input.variant === "PROFORMA"
      ? tenantConfig?.proformaEmailSubject || DEFAULT_PROFORMA_SUBJECT
      : tenantConfig?.estadoPagoEmailSubject || DEFAULT_ESTADO_PAGO_SUBJECT);
  const subject = renderTemplate(subjectTemplate, tokenVars);

  // Intro HTML.
  const rawIntro = input.customIntroHtml ?? null;
  const tenantIntro =
    input.variant === "PROFORMA"
      ? tenantConfig?.proformaEmailIntro
      : tenantConfig?.estadoPagoEmailIntro;
  const introHtml = rawIntro
    ? rawIntro
    : tenantIntro
      ? renderTemplate(tenantIntro, tokenVars).replace(/\n/g, "<br/>")
      : null;

  // Render email HTML.
  const emailEl = createElement(BillingDocumentEmail, {
    variant: input.variant,
    recipientName:
      billingProps.receptor.contactName ?? dte.receiverName,
    receiverCompanyName: dte.receiverName,
    documentTitle:
      input.variant === "PROFORMA"
        ? `Proforma ${dte.folio > 0 ? `N° ${dte.folio}` : ""}`.trim()
        : `Estado de Pago ${billingProps.document.periodoLabel}`,
    documentSubtitle:
      [billingProps.document.installationName, billingProps.document.numeroOrdenContrato]
        .filter(Boolean)
        .join(" · ") || "",
    emisorRazonSocial: billingProps.emisor.razonSocial,
    emisorRut: billingProps.emisor.rut,
    totalFormatted: fmtCurrency(billingProps.totals.totalAmount),
    netFormatted: fmtCurrency(billingProps.totals.netAmount),
    taxFormatted: fmtCurrency(billingProps.totals.taxAmount),
    emissionDate: billingProps.document.dateFormatted,
    numeroOrdenContrato: billingProps.document.numeroOrdenContrato,
    introHtml,
    footerLegalText:
      input.variant === "ESTADO_DE_PAGO"
        ? tenantConfig?.estadoPagoFooterLegal ?? null
        : null,
    brandName: company.commercialName || company.companyName || "OPAI",
    logoUrl: company.brandingLogoFull || company.logoUrl || "",
    brandPrimaryColor: colors.primary,
    brandSecondaryColor: colors.secondary,
    brandTagline: company.brandingTagline || "",
    website: company.website || "",
    emailContact: company.emailContact || company.email || "",
    senderName: company.commercialName || company.companyName || "",
  });
  const html = await render(emailEl);

  // CC: une los del input (modal de envío) con los CC implícitos del
  // plan (contactos seleccionados después del primary). Dedup contra primary.
  const ccCandidates = [...(input.ccEmails ?? []), ...planCcEmails];
  const ccList = Array.from(
    new Set(
      ccCandidates.filter((e) => e && e.trim() && e !== primary),
    ),
  );
  // BCC: empieza con lo que mandó el caller (modal de envío) y agrega
  // como copia oculta de auditoría el primer email del tenant que
  // exista (cascada de fallbacks para cubrir tenants que solo configuraron
  // un campo u otro):
  //   1. empresa.emailReplyTo (Configuración → Empresa → Correo)
  //   2. TenantDteConfig.emisorEmail (Configuración → Facturación → DTE → "Email del emisor")
  //   3. empresa.email comercial principal
  // Dedup contra primary y CC (case-insensitive).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const adminBccCandidates = [
    emailCfg.replyTo,
    tenantConfig?.emisorEmail ?? null,
    company.email,
  ];
  const adminBcc = adminBccCandidates
    .map((e) => (e ?? "").trim())
    .find((e) => e.length > 0 && EMAIL_RE.test(e));
  const rawBcc = [...(input.bccEmails ?? [])];
  if (adminBcc) rawBcc.push(adminBcc);
  const ccLower = ccList.map((c) => c.toLowerCase());
  const bccList = Array.from(
    new Set(
      rawBcc
        .map((e) => e?.trim())
        .filter((e): e is string => !!e && e.length > 0)
        .filter((e) => e.toLowerCase() !== primary.toLowerCase())
        .filter((e) => !ccLower.includes(e.toLowerCase())),
    ),
  );

  // Filename.
  const filename =
    input.variant === "PROFORMA"
      ? `proforma-${dte.folio > 0 ? dte.folio : "draft"}.pdf`
      : `estado-pago-${billingProps.document.dateIso}.pdf`;

  const { successKind, failKind } = variantToKinds(input.variant);

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: [primary],
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer.toString("base64") }],
    });

    if (result.error) {
      await logEmail(tenantId, input.dteId, {
        kind: failKind,
        isAutoFromCron: input.isAutoFromCron ?? false,
        to: [primary],
        cc: ccList,
        bcc: bccList,
        subject,
        status: "failed",
        errorMessage: result.error.message,
        sentBy: input.triggeredBy,
      });
      return { success: false, error: result.error.message };
    }

    // Tracking separado por variante: proformaStatus aplica a Proforma,
    // estadoPagoStatus a Estado de Pago. proformaLastVariant es legacy.
    await prisma.financeDte.update({
      where: { id: input.dteId },
      data:
        input.variant === "PROFORMA"
          ? {
              proformaStatus: "SENT",
              proformaSentAt: new Date(),
              proformaSentCount: { increment: 1 },
              proformaLastVariant: input.variant,
              proformaLastRecipient: primary,
            }
          : {
              estadoPagoStatus: "SENT",
              estadoPagoSentAt: new Date(),
              estadoPagoSentCount: { increment: 1 },
              estadoPagoLastRecipient: primary,
              proformaLastVariant: input.variant, // legacy info
            },
    });

    await logEmail(tenantId, input.dteId, {
      kind: successKind,
      isAutoFromCron: input.isAutoFromCron ?? false,
      to: [primary],
      cc: ccList,
      bcc: bccList,
      subject,
      resendId: result.data?.id ?? null,
      status: "sent",
      sentBy: input.triggeredBy,
    });

    return {
      success: true,
      messageId: result.data?.id,
      pdfBytes: pdfBuffer.byteLength,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEmail(tenantId, input.dteId, {
      kind: failKind,
      isAutoFromCron: input.isAutoFromCron ?? false,
      to: [primary],
      cc: ccList,
      bcc: bccList,
      subject,
      status: "failed",
      errorMessage: message,
      sentBy: input.triggeredBy,
    });
    return { success: false, error: message };
  }
}
