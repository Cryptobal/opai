/**
 * DTE Email Service
 *
 * Sends issued DTEs to the receiver via Resend with both XML and PDF attached.
 * The XML is required by SII regulation — the receiver must be able to validate
 * the digital signature independently.
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";

export interface SendDteEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendDteEmail(
  tenantId: string,
  dteId: string,
  recipientEmail?: string
): Promise<SendDteEmailResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
  });
  if (!dte) return { success: false, error: "DTE no encontrado" };

  const to = recipientEmail ?? dte.receiverEmail;
  if (!to) return { success: false, error: "Receptor no tiene email" };

  const tenantConfig = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
  });
  if (!tenantConfig) {
    return { success: false, error: "Tenant DTE config no existe" };
  }

  let xmlBuffer: Buffer;
  let pdfBuffer: Buffer;
  try {
    const provider = await getDteProvider(tenantId);
    [xmlBuffer, pdfBuffer] = await Promise.all([
      provider.getXml(dte.dteType, dte.folio),
      provider.getPdf(dte.dteType, dte.folio),
    ]);
  } catch (err) {
    return {
      success: false,
      error: `Error obteniendo XML/PDF: ${(err as Error).message}`,
    };
  }

  const emailCfg = await getTenantEmailConfig(tenantId);
  const razonSocial = tenantConfig.emisorRazonSocial ?? emailCfg.companyName;
  const tipoNombre = dteTypeName(dte.dteType);
  const subject = `${tipoNombre} N° ${dte.folio} - ${razonSocial}`;
  const totalCLP = Number(dte.totalAmount).toLocaleString("es-CL");
  const dateStr = dte.date.toISOString().split("T")[0];

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #0066FF;">${tipoNombre} Electrónica</h2>
    <p>Estimado/a ${dte.receiverName},</p>
    <p>Adjunto encontrará la <strong>${tipoNombre} N° ${dte.folio}</strong> emitida por ${razonSocial}.</p>
    <table style="border-collapse: collapse; margin-top: 20px;">
      <tr><td style="padding: 4px 12px;"><strong>Folio:</strong></td><td>${dte.folio}</td></tr>
      <tr><td style="padding: 4px 12px;"><strong>Fecha:</strong></td><td>${dateStr}</td></tr>
      <tr><td style="padding: 4px 12px;"><strong>Total:</strong></td><td>$${totalCLP}</td></tr>
    </table>
    <p style="margin-top: 30px; font-size: 12px; color: #666;">
      Se adjunta el archivo XML firmado electrónicamente conforme a la normativa del SII de Chile.
    </p>
  </body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to,
      subject,
      html,
      attachments: [
        {
          filename: `${dte.code}.xml`,
          content: xmlBuffer.toString("base64"),
        },
        {
          filename: `${dte.code}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    if (result.error) {
      await prisma.financeDte.update({
        where: { id: dteId },
        data: { emailStatus: "FAILED" },
      });
      return { success: false, error: result.error.message };
    }

    await prisma.financeDte.update({
      where: { id: dteId },
      data: { emailSentAt: new Date(), emailStatus: "SENT" },
    });

    return { success: true, messageId: result.data?.id };
  } catch (err) {
    await prisma.financeDte.update({
      where: { id: dteId },
      data: { emailStatus: "FAILED" },
    });
    return { success: false, error: (err as Error).message };
  }
}

function dteTypeName(t: number): string {
  switch (t) {
    case 33:
      return "Factura";
    case 34:
      return "Factura Exenta";
    case 39:
      return "Boleta";
    case 41:
      return "Boleta Exenta";
    case 52:
      return "Guía de Despacho";
    case 56:
      return "Nota de Débito";
    case 61:
      return "Nota de Crédito";
    default:
      return "Documento";
  }
}
