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
import { getTenantEmailConfig } from "@/lib/resend";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import { getDteTypeName as dteTypeName } from "../shared/constants/dte-types";
import { renderDteEmailHtml, renderDteEmailSubject } from "./dte-email-template";
import { getFileBuffer } from "@/lib/storage";
import { buildDteAttachmentBaseName } from "./dte-filename";

/**
 * Resuelve el kind del catálogo transaccional según el tipo de DTE.
 * Los 3 kinds (invoice/credit_note/debit_note) están marcados como
 * `required: true` en el catálogo: nunca se skipean por toggle del tenant.
 */
function dteKindForType(
  dteType: number,
): "dte_invoice_sent" | "dte_credit_note_sent" | "dte_debit_note_sent" {
  if (dteType === 61) return "dte_credit_note_sent";
  if (dteType === 56) return "dte_debit_note_sent";
  // Factura electrónica (33), Factura exenta (34), Boleta (39),
  // Boleta exenta (41), Guía despacho (52), Factura compra (46),
  // Factura exportación (110), etc. → todos van como "invoice".
  return "dte_invoice_sent";
}

export interface SendDteEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Post-Fase 1.C: FinanceDteEmailLog.kind/status/attachments son enums
// Prisma en MAYÚSCULA. El type local mantiene el mismo set de valores
// para que el call site no cambie semánticamente; mapea 1:1 al enum.
export type DteEmailKind =
  | "AUTO_RECEIVER"
  | "AUTO_BACKOFFICE"
  | "MANUAL_RESEND"
  | "MANUAL_OVERRIDE_RECIPIENT"
  | "MANUAL_BACKOFFICE";


async function logEmail(
  tenantId: string,
  dteId: string,
  data: {
    kind: DteEmailKind;
    to: string[];
    cc: string[];
    bcc?: string[];
    subject: string;
    attachments: "PDF_XML" | "XML_ONLY" | "PDF_ONLY";
    status: "SENT" | "FAILED";
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
        bcc: data.bcc ?? [],
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
  kind: DteEmailKind = "MANUAL_RESEND",
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

  // Primario (TO): receptor explícito > receiverEmail del DTE. Si el DTE no
  // tiene receiverEmail pero SÍ tiene CC (caso típico: cliente sin email
  // primario guardado pero con contactos CRM cargados como CC), promovemos el
  // primer CC válido a TO para que el correo igual salga. Regla: el envío
  // nunca queda mudo si existe AL MENOS un destinatario válido.
  let primary = recipientEmail ?? dte.receiverEmail ?? null;
  let ccSource = ccOverride ?? dte.receiverEmailCc ?? [];
  if (!primary?.trim()) {
    const firstCc = ccSource.find((e) => typeof e === "string" && e.trim());
    if (firstCc) {
      primary = firstCc;
      ccSource = ccSource.filter((e) => e !== firstCc);
    }
  }
  if (!primary?.trim()) return { success: false, error: "Receptor no tiene email" };

  // CC real: filtrar duplicados con el primario y emails inválidos.
  const ccList = ccSource.filter(
    (e) => typeof e === "string" && e.trim() && e !== primary,
  );

  const tenantConfig = await prisma.tenantDteConfig.findUnique({ where: { tenantId } });
  if (!tenantConfig) return { success: false, error: "Tenant DTE config no existe" };

  // Email config: solo usado abajo para resolver `companyName` en los vars
  // del template y para el subject. El routing (from / replyTo / bcc) lo
  // resuelve `sendTenantEmail` consultando `getTenantEmailRouting()`.
  const emailCfg = await getTenantEmailConfig(tenantId);

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
    const result = await sendTenantEmail({
      tenantId,
      module: "finance",
      kind: dteKindForType(dte.dteType),
      to: primary,
      cc: ccList,
      // Solo BCC manual del caller. El helper mergea con CCO Finanzas.
      bcc: bccOverride ?? [],
      subject,
      html,
      attachments: [
        { filename: `${dteFilenameBase}.xml`, content: xmlBuffer.toString("base64") },
        { filename: `${dteFilenameBase}.pdf`, content: pdfBuffer.toString("base64") },
        ...userAttachmentPayloads,
      ],
    });

    // Los 3 kinds de DTE son `required` en el catálogo → siempre devuelve
    // resendId si llegó a Resend. Si no, fue por excepción y caemos al catch.
    await prisma.financeDte.update({
      where: { id: dteId },
      data: { emailSentAt: new Date(), emailStatus: "SENT" },
    });
    await logEmail(tenantId, dteId, {
      kind,
      to: result.effectiveTo,
      cc: result.effectiveCc,
      bcc: result.effectiveBcc,
      subject,
      attachments: "PDF_XML",
      status: "SENT",
      resendId: result.resendId ?? undefined,
      sentBy: triggeredBy ?? null,
    });
    return { success: true, messageId: result.resendId ?? undefined };
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
      bcc: [],
      subject,
      attachments: "PDF_XML",
      status: "FAILED",
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

  const kind: DteEmailKind = opts?.kindOverride ?? (opts?.triggeredBy ? "MANUAL_BACKOFFICE" : "AUTO_BACKOFFICE");

  const dteFilenameBase = await buildDteAttachmentBaseName(tenantId, dte);

  try {
    const result = await sendTenantEmail({
      tenantId,
      module: "finance",
      kind: "dte_backoffice_copy",
      to: recipients,
      // El BCC automático del módulo Finanzas se mergea dentro del helper.
      // No pasamos BCCs manuales para esta copia interna.
      bcc: [],
      subject,
      html,
      attachments: [
        { filename: `${dteFilenameBase}.xml`, content: xmlBuffer.toString("base64") },
      ],
    });

    if (!result.resendId) {
      // Toggle del tenant desactivado para `dte_backoffice_copy`.
      await logEmail(tenantId, dteId, {
        kind,
        to: result.effectiveTo,
        cc: [],
        bcc: result.effectiveBcc,
        subject,
        attachments: "XML_ONLY",
        status: "FAILED",
        errorMessage:
          "Envío skipeado: el toggle de 'Copia XML al backoffice' está desactivado.",
        sentBy: opts?.triggeredBy ?? null,
      });
      return {
        success: false,
        error: "Envío skipeado: toggle desactivado.",
      };
    }

    await logEmail(tenantId, dteId, {
      kind,
      to: result.effectiveTo,
      cc: [],
      bcc: result.effectiveBcc,
      subject,
      attachments: "XML_ONLY",
      status: "SENT",
      resendId: result.resendId,
      sentBy: opts?.triggeredBy ?? null,
    });
    return { success: true, messageId: result.resendId };
  } catch (err) {
    const message = (err as Error).message;
    await logEmail(tenantId, dteId, {
      kind,
      to: recipients,
      cc: [],
      bcc: [],
      subject,
      attachments: "XML_ONLY",
      status: "FAILED",
      errorMessage: message,
      sentBy: opts?.triggeredBy ?? null,
    });
    return { success: false, error: message };
  }
}
