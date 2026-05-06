/**
 * DTE Email Service
 *
 * Envía DTEs emitidos al receptor (PDF+XML) y, opcionalmente, una copia
 * con SOLO el XML al backoffice (contador externo). Usa Resend con CC
 * real. Cada envío queda registrado en FinanceDteEmailLog para timeline.
 *
 * El XML SII solo lleva un <CorreoRecep> (campo receiverEmail). Estos
 * envíos son externos y no afectan el XML.
 */
import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import { getDteTypeName as dteTypeName } from "../shared/constants/dte-types";
import { renderDteEmailHtml, renderDteEmailSubject } from "./dte-email-template";

export interface SendDteEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type DteEmailKind =
  | "auto_receiver"
  | "auto_backoffice"
  | "manual_resend"
  | "manual_override_recipient"
  | "manual_backoffice";

async function logEmail(
  tenantId: string,
  dteId: string,
  data: {
    kind: DteEmailKind;
    to: string[];
    cc: string[];
    subject: string;
    attachments: "pdf_xml" | "xml_only" | "pdf_only";
    status: "sent" | "failed";
    resendId?: string | null;
    errorMessage?: string | null;
    sentBy?: string | null;
  },
) {
  try {
    await prisma.financeDteEmailLog.create({
      data: {
        tenantId,
        dteId,
        kind: data.kind,
        to: data.to,
        cc: data.cc,
        subject: data.subject,
        attachments: data.attachments,
        status: data.status,
        resendId: data.resendId ?? null,
        errorMessage: data.errorMessage ?? null,
        sentBy: data.sentBy ?? null,
      },
    });
  } catch (err) {
    console.error("[FINANCE/email-log] Failed to persist log:", err);
  }
}

/**
 * Envía email al receptor con PDF + XML. Si la lista de CC trae emails,
 * se mandan en el campo `cc` de Resend (no en `to`).
 */
export async function sendDteEmail(
  tenantId: string,
  dteId: string,
  recipientEmail?: string,
  ccOverride?: string[],
  kind: DteEmailKind = "manual_resend",
  triggeredBy?: string,
): Promise<SendDteEmailResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
  });
  if (!dte) return { success: false, error: "DTE no encontrado" };
  if (dte.siiStatus === "DRAFT") {
    return { success: false, error: "No se puede enviar email de un borrador" };
  }

  const primary = recipientEmail ?? dte.receiverEmail ?? null;
  if (!primary) return { success: false, error: "Receptor no tiene email" };

  // CC real: filtrar duplicados con el primario y emails inválidos.
  const ccList = (ccOverride ?? dte.receiverEmailCc ?? []).filter(
    (e) => typeof e === "string" && e.trim() && e !== primary,
  );

  const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
  if (!tenantConfig) return { success: false, error: "Tenant DTE config no existe" };

  let xmlBuffer: Buffer;
  let pdfBuffer: Buffer;
  try {
    const provider = await getDteProvider(tenantId);
    [xmlBuffer, pdfBuffer] = await Promise.all([
      provider.getXml(dte.dteType, dte.folio),
      provider.getPdf(dte.dteType, dte.folio),
    ]);
  } catch (err) {
    const errorMsg = `Error obteniendo XML/PDF: ${(err as Error).message}`;
    return { success: false, error: errorMsg };
  }

  const emailCfg = await getTenantEmailConfig(tenantId);
  const razonSocial = tenantConfig.emisorRazonSocial ?? emailCfg.companyName;
  const tipoNombre = dteTypeName(dte.dteType);
  const vars = {
    razonSocial,
    folio: String(dte.folio),
    tipo: tipoNombre,
    total: Number(dte.totalAmount).toLocaleString("es-CL"),
    fecha: dte.date.toISOString().split("T")[0],
    receiverName: dte.receiverName,
  };
  const subject = renderDteEmailSubject(tenantConfig.emailTemplateSubject, vars);
  const html = renderDteEmailHtml(tenantConfig.emailTemplateBody, vars);

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: [primary],
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      html,
      attachments: [
        { filename: `${dte.code}.xml`, content: xmlBuffer.toString("base64") },
        { filename: `${dte.code}.pdf`, content: pdfBuffer.toString("base64") },
      ],
    });

    if (result.error) {
      await prisma.financeDte.update({
        where: { id: dteId },
        data: { emailStatus: "FAILED" },
      });
      await logEmail(tenantId, dteId, {
        kind,
        to: [primary],
        cc: ccList,
        subject,
        attachments: "pdf_xml",
        status: "failed",
        errorMessage: result.error.message,
        sentBy: triggeredBy ?? null,
      });
      return { success: false, error: result.error.message };
    }

    await prisma.financeDte.update({
      where: { id: dteId },
      data: { emailSentAt: new Date(), emailStatus: "SENT" },
    });
    await logEmail(tenantId, dteId, {
      kind,
      to: [primary],
      cc: ccList,
      subject,
      attachments: "pdf_xml",
      status: "sent",
      resendId: result.data?.id,
      sentBy: triggeredBy ?? null,
    });
    return { success: true, messageId: result.data?.id };
  } catch (err) {
    const message = (err as Error).message;
    await prisma.financeDte.update({
      where: { id: dteId },
      data: { emailStatus: "FAILED" },
    });
    await logEmail(tenantId, dteId, {
      kind,
      to: [primary],
      cc: ccList,
      subject,
      attachments: "pdf_xml",
      status: "failed",
      errorMessage: message,
      sentBy: triggeredBy ?? null,
    });
    return { success: false, error: message };
  }
}

/**
 * Envía un email aparte SOLO con el XML adjunto a los destinatarios de
 * backoffice del tenant (typ. contador). Diseñado para ejecutarse en
 * paralelo al sendDteEmail() del receptor sin bloquearlo. NO afecta el
 * email del receptor ni el XML SII.
 */
export async function sendDteXmlToBackoffice(
  tenantId: string,
  dteId: string,
  opts?: { emailsOverride?: string[]; triggeredBy?: string; kindOverride?: DteEmailKind },
): Promise<SendDteEmailResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
  });
  if (!dte) return { success: false, error: "DTE no encontrado" };
  if (dte.siiStatus === "DRAFT") {
    return { success: false, error: "No se puede enviar XML de un borrador" };
  }

  const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
  if (!tenantConfig) return { success: false, error: "Tenant DTE config no existe" };

  const recipients = (opts?.emailsOverride && opts.emailsOverride.length > 0
    ? opts.emailsOverride
    : tenantConfig.defaultXmlRecipientEmails
  ).filter((e) => typeof e === "string" && e.trim());

  if (recipients.length === 0) {
    // No hay destinatarios — silencio: NO se loguea (no es error).
    return { success: false, error: "No hay destinatarios backoffice configurados" };
  }

  let xmlBuffer: Buffer;
  try {
    const provider = await getDteProvider(tenantId);
    xmlBuffer = await provider.getXml(dte.dteType, dte.folio);
  } catch (err) {
    return { success: false, error: `Error obteniendo XML: ${(err as Error).message}` };
  }

  const emailCfg = await getTenantEmailConfig(tenantId);
  const razonSocial = tenantConfig.emisorRazonSocial ?? emailCfg.companyName;
  const tipoNombre = dteTypeName(dte.dteType);
  const subject = `[XML] ${tipoNombre} N° ${dte.folio} - ${razonSocial}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 600px;">
<p>Adjunto XML del DTE recién emitido para registro contable.</p>
<table style="margin-top: 16px; border-collapse: collapse;">
  <tr><td style="padding: 4px 12px;"><strong>Tipo:</strong></td><td>${tipoNombre}</td></tr>
  <tr><td style="padding: 4px 12px;"><strong>Folio:</strong></td><td>${dte.folio}</td></tr>
  <tr><td style="padding: 4px 12px;"><strong>Receptor:</strong></td><td>${dte.receiverName} (${dte.receiverRut})</td></tr>
  <tr><td style="padding: 4px 12px;"><strong>Fecha:</strong></td><td>${dte.date.toISOString().split("T")[0]}</td></tr>
  <tr><td style="padding: 4px 12px;"><strong>Total CLP:</strong></td><td>$${Number(dte.totalAmount).toLocaleString("es-CL")}</td></tr>
</table>
<p style="margin-top: 24px; font-size: 12px; color: #666;">
  Email automático enviado por Opai. Si no debería recibir esto, configurelo en
  Finanzas → Configuración DTE → Email XML al backoffice.
</p>
</body></html>`;

  const kind: DteEmailKind = opts?.kindOverride ?? (opts?.triggeredBy ? "manual_backoffice" : "auto_backoffice");

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: recipients,
      subject,
      html,
      attachments: [{ filename: `${dte.code}.xml`, content: xmlBuffer.toString("base64") }],
    });

    if (result.error) {
      await logEmail(tenantId, dteId, {
        kind,
        to: recipients,
        cc: [],
        subject,
        attachments: "xml_only",
        status: "failed",
        errorMessage: result.error.message,
        sentBy: opts?.triggeredBy ?? null,
      });
      return { success: false, error: result.error.message };
    }

    await logEmail(tenantId, dteId, {
      kind,
      to: recipients,
      cc: [],
      subject,
      attachments: "xml_only",
      status: "sent",
      resendId: result.data?.id,
      sentBy: opts?.triggeredBy ?? null,
    });
    return { success: true, messageId: result.data?.id };
  } catch (err) {
    const message = (err as Error).message;
    await logEmail(tenantId, dteId, {
      kind,
      to: recipients,
      cc: [],
      subject,
      attachments: "xml_only",
      status: "failed",
      errorMessage: message,
      sentBy: opts?.triggeredBy ?? null,
    });
    return { success: false, error: message };
  }
}
