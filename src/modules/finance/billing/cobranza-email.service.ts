/**
 * Cobranza Email Service — HTML branded + PDF adjunto + FinanceDteEmailLog.
 *
 * Usa DocTemplate (mail → whatsapp fallback) con tokens resueltos. Adjunta
 * el PDF del DTE emitido cuando está disponible.
 */

import "server-only";
import { createElement } from "react";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import {
  resolveDocument,
  tiptapToPlainText,
  type EntityData,
} from "@/lib/docs/token-resolver";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getTenantEmailConfig } from "@/lib/resend";
import { CobranzaEmail } from "@/emails/CobranzaEmail";
import { getDtePdf } from "./dte-pdf.service";
import { buildDteAttachmentBaseName } from "./dte-filename";
import {
  cobranzaSlugLabel,
  type CobranzaSlug,
} from "./cobranza-shared";

export type { CobranzaSlug };

export interface SendCobranzaEmailInput {
  tenantId: string;
  dteId: string;
  contactId: string;
  slug: CobranzaSlug;
  customMessage?: string;
  sentBy: string;
}

export interface SendCobranzaEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const SUBJECT_BY_SLUG: Record<CobranzaSlug, string> = {
  cobranza_amable: "Recordatorio de pago — Factura {folio}",
  cobranza_firme: "Pago pendiente — Factura {folio}",
  cobranza_prejudicial: "Aviso pre-judicial — Factura {folio}",
};

async function logCobranzaEmail(
  tenantId: string,
  dteId: string,
  data: {
    to: string[];
    bcc: string[];
    subject: string;
    status: "SENT" | "FAILED";
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
        kind: "MANUAL_COBRANZA",
        to: data.to,
        cc: [],
        bcc: data.bcc,
        subject: data.subject,
        attachments: "PDF_ONLY",
        status: data.status,
        resendId: data.resendId ?? null,
        errorMessage: data.errorMessage ?? null,
        sentBy: data.sentBy,
      },
    });
  } catch (err) {
    console.warn("[cobranza-email] log error:", err);
  }
}

export async function sendCobranzaEmail(
  input: SendCobranzaEmailInput,
): Promise<SendCobranzaEmailResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: input.dteId, tenantId: input.tenantId },
    select: {
      id: true,
      code: true,
      folio: true,
      dteType: true,
      date: true,
      dueDate: true,
      totalAmount: true,
      receiverName: true,
      receiverRut: true,
      crmAccountId: true,
      installationId: true,
    },
  });
  if (!dte) return { ok: false, error: "DTE no encontrado" };

  const contact = await prisma.crmContact.findFirst({
    where: { id: input.contactId, tenantId: input.tenantId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!contact?.email) return { ok: false, error: "Contacto sin email" };

  const tpl =
    (await prisma.docTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        module: "mail",
        usageSlug: input.slug,
        isActive: true,
      },
    })) ??
    (await prisma.docTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        module: "whatsapp",
        usageSlug: input.slug,
        isActive: true,
      },
    }));

  const tenantCfg = await getTenantCompanyConfig(input.tenantId);
  const admin = await prisma.admin.findUnique({
    where: { id: input.sentBy },
    select: { name: true, email: true, cargo: true },
  });
  const totalFmt = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(Number(dte.totalAmount));
  const today = new Date();
  const due = dte.dueDate ? new Date(dte.dueDate) : null;
  const daysOverdue = due
    ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
    : 0;
  const dueFmt = due
    ? due.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
    : "";

  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId: input.tenantId },
      })
    : null;

  const parts = (admin?.name || "").trim().split(/\s+/);
  const entities: EntityData = {
    tenant: {
      commercialName: tenantCfg.commercialName,
      website: tenantCfg.website,
      phone: tenantCfg.phone,
      email: tenantCfg.email,
      whatsappLink: tenantCfg.whatsappLink,
    },
    actor: {
      firstName: parts[0] ?? "",
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
      name: admin?.name ?? "",
      email: admin?.email ?? "",
      roleTitle: admin?.cargo ?? "",
    },
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    },
    account: account ?? undefined,
    dte: {
      id: dte.id,
      folio: String(dte.folio),
      type: String(dte.dteType),
      date: dte.date.toISOString().slice(0, 10),
      dueDate: due ? due.toISOString().slice(0, 10) : "",
      totalAmount: Number(dte.totalAmount),
      totalAmountFormatted: totalFmt,
      receiverName: dte.receiverName,
      receiverRut: dte.receiverRut,
      daysOverdue: String(daysOverdue),
    },
  };

  let bodyText = "";
  if (input.customMessage?.trim()) {
    bodyText = input.customMessage.trim();
  } else if (tpl?.content) {
    const { resolvedContent } = resolveDocument(tpl.content as never, entities);
    bodyText = tiptapToPlainText(resolvedContent).trim();
  }
  if (!bodyText) {
    return { ok: false, error: "Mensaje vacío — plantilla no encontrada" };
  }

  const subject = SUBJECT_BY_SLUG[input.slug].replace("{folio}", String(dte.folio));
  const recipientName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "Cliente";

  const html = await render(
    createElement(CobranzaEmail, {
      recipientName,
      bodyText,
      folio: String(dte.folio),
      receiverCompanyName: dte.receiverName ?? account?.name ?? "",
      totalFormatted: totalFmt,
      dueDate: dueFmt,
      daysOverdue,
      slugLabel: cobranzaSlugLabel(input.slug),
      brandName: tenantCfg.commercialName ?? "OPAI",
      logoUrl: tenantCfg.logoUrl ?? undefined,
      brandPrimaryColor: tenantCfg.brandingPrimaryColor ?? undefined,
      senderName: admin?.name ?? undefined,
      senderEmail: admin?.email ?? tenantCfg.email ?? undefined,
      website: tenantCfg.website ?? undefined,
    }),
    { pretty: true },
  );

  const tenantEmailCfg = await getTenantEmailConfig(input.tenantId);
  const primaryLower = contact.email.toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const explicitBcc = (tenantEmailCfg.alwaysBcc ?? [])
    .map((e) => e?.trim())
    .filter((e): e is string => !!e && EMAIL_RE.test(e));
  let bccCandidates = explicitBcc;
  if (explicitBcc.length === 0) {
    const dteCfg = await prisma.tenantDteConfig.findUnique({
      where: { tenantId: input.tenantId },
      select: { emisorEmail: true },
    });
    const fallback = [tenantEmailCfg.replyTo, dteCfg?.emisorEmail ?? "", tenantCfg.email]
      .map((e) => (e ?? "").trim())
      .find((e) => e.length > 0 && EMAIL_RE.test(e));
    if (fallback) bccCandidates = [fallback];
  }
  const tenantBcc = bccCandidates
    .filter((e) => e.toLowerCase() !== primaryLower)
    .filter((e, idx, arr) => arr.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === idx);

  const attachments: Array<{ filename: string; content: string }> = [];
  try {
    const pdfBuffer = await getDtePdf(input.tenantId, input.dteId);
    const base = await buildDteAttachmentBaseName(input.tenantId, dte);
    attachments.push({
      filename: `${base}.pdf`,
      content: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    console.warn("[cobranza-email] PDF adjunto omitido:", err);
  }

  try {
    const result = await sendTenantEmail({
      tenantId: input.tenantId,
      module: "finance",
      kind: "cobranza_manual",
      to: contact.email,
      bcc: tenantBcc.length > 0 ? tenantBcc : undefined,
      subject,
      html,
      text: bodyText,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    const ok = !!result.resendId;
    await logCobranzaEmail(input.tenantId, input.dteId, {
      to: result.effectiveTo.length > 0 ? result.effectiveTo : [contact.email],
      bcc: result.effectiveBcc,
      subject,
      status: ok ? "SENT" : "FAILED",
      resendId: result.resendId,
      errorMessage: ok ? null : "Envío omitido o rechazado por configuración del tenant",
      sentBy: input.sentBy,
    });

    if (!ok) {
      return { ok: false, error: "No se pudo enviar el email de cobranza" };
    }
    return { ok: true, messageId: result.resendId ?? undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCobranzaEmail(input.tenantId, input.dteId, {
      to: [contact.email],
      bcc: tenantBcc,
      subject,
      status: "FAILED",
      errorMessage: msg,
      sentBy: input.sentBy,
    });
    return { ok: false, error: msg };
  }
}
