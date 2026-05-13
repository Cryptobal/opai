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
import {
  FinanceDteEmailKind,
  FinanceDteEmailStatus,
  FinanceDteEmailAttachments,
} from "@prisma/client";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import { getDteTypeName as dteTypeName } from "../shared/constants/dte-types";
import { renderDteEmailHtml, renderDteEmailSubject } from "./dte-email-template";
import { getFileBuffer } from "@/lib/storage";
import { buildDteAttachmentBaseName } from "./dte-filename";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendDteEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Union de strings legacy (snake_case) que los callers actuales pasan al
 * servicio. Se incluyen 4 valores doc-cobro (`proforma_*` / `estado_pago_*`)
 * porque `billing-document-send.service.ts` escribe a la misma tabla y
 * comparte el helper `kindToFinanceEmailKind` definido abajo. La Fase 2 del
 * refactor de email migra los callers a `FinanceDteEmailKind` directamente.
 */
export type DteEmailKind =
  | "auto_receiver"
  | "auto_backoffice"
  | "manual_resend"
  | "manual_override_recipient"
  | "manual_backoffice"
  | "proforma_sent"
  | "estado_pago_sent"
  | "proforma_failed"
  | "estado_pago_failed";

const KIND_MAP: Record<DteEmailKind, FinanceDteEmailKind> = {
  auto_receiver: FinanceDteEmailKind.AUTO_RECEIVER,
  auto_backoffice: FinanceDteEmailKind.AUTO_BACKOFFICE,
  manual_resend: FinanceDteEmailKind.MANUAL_RESEND,
  manual_override_recipient: FinanceDteEmailKind.MANUAL_OVERRIDE_RECIPIENT,
  manual_backoffice: FinanceDteEmailKind.MANUAL_BACKOFFICE,
  proforma_sent: FinanceDteEmailKind.PROFORMA_SENT,
  estado_pago_sent: FinanceDteEmailKind.ESTADO_PAGO_SENT,
  proforma_failed: FinanceDteEmailKind.PROFORMA_FAILED,
  estado_pago_failed: FinanceDteEmailKind.ESTADO_PAGO_FAILED,
};

/** Convierte el string legacy snake_case al enum tipado de Prisma. */
export function kindToFinanceEmailKind(legacy: DteEmailKind): FinanceDteEmailKind {
  return KIND_MAP[legacy];
}

/** Convierte el status legacy snake_case al enum tipado de Prisma. */
export function statusToFinanceEmailStatus(
  legacy: "sent" | "failed",
): FinanceDteEmailStatus {
  return legacy === "sent"
    ? FinanceDteEmailStatus.SENT
    : FinanceDteEmailStatus.FAILED;
}

/** Convierte el attachments legacy snake_case al enum tipado de Prisma. */
export function attachmentsToFinanceEmailAttachments(
  legacy: "pdf_xml" | "xml_only" | "pdf_only",
): FinanceDteEmailAttachments {
  switch (legacy) {
    case "pdf_xml":
      return FinanceDteEmailAttachments.PDF_XML;
    case "xml_only":
      return FinanceDteEmailAttachments.XML_ONLY;
    case "pdf_only":
      return FinanceDteEmailAttachments.PDF_ONLY;
  }
}


async function logEmail(
  tenantId: string,
  dteId: string,
  data: {
    kind: DteEmailKind;
    to: string[];
    cc: string[];
    bcc?: string[];
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
        kind: kindToFinanceEmailKind(data.kind),
        to: data.to,
        cc: data.cc,
        bcc: data.bcc ?? [],
        subject: data.subject,
        attachments: attachmentsToFinanceEmailAttachments(data.attachments),
        status: statusToFinanceEmailStatus(data.status),
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
 * se mandan en el campo `cc` de Resend (no en `to`). BCC sigue la misma
 * lógica pero queda invisible para el receptor (útil cuando el usuario
 * quiere que el contador interno reciba copia sin que el cliente lo vea).
 *
 * Si el DTE tiene FinanceDteAttachment con kind="USER_UPLOAD", se incluyen
 * por defecto en el correo, salvo que vengan en `excludeAttachmentIds`
 * (típicamente desde el modal de envío manual).
 */
export async function sendDteEmail(
  tenantId: string,
  dteId: string,
  recipientEmail?: string,
  ccOverride?: string[],
  kind: DteEmailKind = "manual_resend",
  triggeredBy?: string,
  bccOverride?: string[],
  excludeAttachmentIds?: string[],
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

  // BCC: empieza con lo que mandó el caller (manual override del dialog
  // de reenvío). Después agregamos el `emailReplyTo` del tenant para que
  // admin reciba siempre una copia oculta como auditoría (estándar pedido
  // por el usuario 2026-05). Si está duplicado con primary/CC/BCC, se
  // dedupea más abajo.
  const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
  if (!tenantConfig) return { success: false, error: "Tenant DTE config no existe" };

  const emailCfg = await getTenantEmailConfig(tenantId);
  const adminBcc = (emailCfg.replyTo ?? "").trim();
  const rawBcc = [...(bccOverride ?? [])];
  if (adminBcc && EMAIL_RE.test(adminBcc)) rawBcc.push(adminBcc);

  const bccList = rawBcc.filter(
    (e, idx, arr) =>
      typeof e === "string" &&
      e.trim() &&
      e !== primary &&
      !ccList.includes(e) &&
      arr.indexOf(e) === idx, // dedupe interno
  );

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

  // Cargar adjuntos USER_UPLOAD (subidos por el usuario) que viajen junto
  // al PDF y XML. Excluimos los que el usuario marcó para excluir desde el
  // modal de envío. Si la descarga de un adjunto falla, lo omitimos del
  // correo (no rompemos el envío entero).
  const excludeSet = new Set(excludeAttachmentIds ?? []);
  const userAttachments = await prisma.financeDteAttachment.findMany({
    where: { dteId, tenantId, kind: "USER_UPLOAD" },
    select: { id: true, filename: true, mimeType: true, storageKey: true, data: true },
  });
  const userAttachmentPayloads: Array<{ filename: string; content: string }> = [];
  for (const att of userAttachments) {
    if (excludeSet.has(att.id)) continue;
    try {
      let buf: Buffer | null = null;
      if (att.storageKey) {
        buf = await getFileBuffer(att.storageKey, 10 * 1024 * 1024);
      } else if (att.data) {
        buf = Buffer.from(att.data);
      }
      if (buf) {
        userAttachmentPayloads.push({
          filename: att.filename,
          content: buf.toString("base64"),
        });
      }
    } catch (err) {
      console.error(
        `[finance/email] failed loading attachment ${att.id} for DTE ${dteId}:`,
        err,
      );
    }
  }

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

  // Filename del PDF y XML adjuntos: queremos algo identificable. Incluimos
  // folio + cliente + instalación cuando están disponibles, para que el
  // receptor pueda buscarlos por nombre. dte.code (formato F<tipo>-<folio>)
  // queda como fallback puro.
  const dteFilenameBase = await buildDteAttachmentBaseName(tenantId, dte);

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: [primary],
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject,
      html,
      attachments: [
        { filename: `${dteFilenameBase}.xml`, content: xmlBuffer.toString("base64") },
        { filename: `${dteFilenameBase}.pdf`, content: pdfBuffer.toString("base64") },
        ...userAttachmentPayloads,
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
        bcc: bccList,
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
      bcc: bccList,
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
      bcc: bccList,
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

  const dteFilenameBase = await buildDteAttachmentBaseName(tenantId, dte);

  // Auto-BCC al `emailReplyTo` del tenant para auditoría — solo si no
  // está ya como destinatario directo (evita duplicado en bandeja).
  const adminBcc = (emailCfg.replyTo ?? "").trim();
  const backofficeBccList =
    adminBcc && EMAIL_RE.test(adminBcc) && !recipients.includes(adminBcc)
      ? [adminBcc]
      : undefined;

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: recipients,
      bcc: backofficeBccList,
      subject,
      html,
      attachments: [{ filename: `${dteFilenameBase}.xml`, content: xmlBuffer.toString("base64") }],
    });

    if (result.error) {
      await logEmail(tenantId, dteId, {
        kind,
        to: recipients,
        cc: [],
        bcc: backofficeBccList ?? [],
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
      bcc: backofficeBccList ?? [],
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
      bcc: backofficeBccList ?? [],
      subject,
      attachments: "xml_only",
      status: "failed",
      errorMessage: message,
      sentBy: opts?.triggeredBy ?? null,
    });
    return { success: false, error: message };
  }
}
