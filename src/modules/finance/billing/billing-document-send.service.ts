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
import {
  kindToFinanceEmailKind,
  statusToFinanceEmailStatus,
  attachmentsToFinanceEmailAttachments,
} from "./dte-email.service";

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

async function logEmail(
  tenantId: string,
  dteId: string,
  data: {
    kind: BillingDocEmailKind;
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
  try {
    await prisma.financeDteEmailLog.create({
      data: {
        tenantId,
        dteId,
        kind: kindToFinanceEmailKind(data.kind),
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        attachments: attachmentsToFinanceEmailAttachments("pdf_only"),
        status: statusToFinanceEmailStatus(data.status),
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
    return {
      success: false,
      error:
        "No se puede enviar proforma de un DTE ya emitido. Para reenviar el DTE, usar 'Reenviar email'.",
    };
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
    return {
      success: false,
      error:
        "No hay destinatario configurado. Editá el borrador y elegí contactos del cliente en \"Documento de Cobro\".",
    };
  }

  // Construir props + renderizar PDF.
  const billingProps = await buildBillingDocProps(
    tenantId,
    input.dteId,
    input.variant,
    { signerOverrideIds: input.signerOverrides },
  );
  const pdfBuffer = await renderBillingDocPdf(billingProps);

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
  const bccList = (input.bccEmails ?? []).filter(
    (e) => e && e.trim() && e !== primary,
  );

  // Filename.
  const filename =
    input.variant === "PROFORMA"
      ? `proforma-${dte.folio > 0 ? dte.folio : "draft"}.pdf`
      : `estado-pago-${billingProps.document.dateIso}.pdf`;

  const successKind: BillingDocEmailKind =
    input.variant === "PROFORMA" ? "proforma_sent" : "estado_pago_sent";
  const failKind: BillingDocEmailKind =
    input.variant === "PROFORMA" ? "proforma_failed" : "estado_pago_failed";

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
