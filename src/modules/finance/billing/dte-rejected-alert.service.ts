/**
 * DTE Rejected Alert Service
 *
 * Envía un email a los emails de alerta del tenant cuando un DTE pasa
 * a estado REJECTED por el SII. La lista de destinatarios está en
 * `TenantDteConfig.alertEmails` (configurada en hub DTE).
 *
 * Idempotente: no envía dos veces el mismo email para el mismo DTE
 * porque solo se llama UNA vez en la transición SENT/PENDING → REJECTED
 * (vía dte-status-poll.service.ts y checkDteStatus en dte-issuer).
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";

export interface SendRejectedAlertResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Si NO se envió porque alertEmails está vacío. */
  skipped?: boolean;
}

const DTE_TYPE_NAME: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

export async function sendDteRejectedAlert(
  tenantId: string,
  dteId: string,
): Promise<SendRejectedAlertResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
    select: {
      id: true,
      dteType: true,
      folio: true,
      receiverRut: true,
      receiverName: true,
      totalAmount: true,
      date: true,
      siiResponse: true,
      siiTrackId: true,
    },
  });
  if (!dte) return { success: false, error: "DTE no encontrado" };

  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: { alertEmails: true, emisorRazonSocial: true },
  });
  if (!config) return { success: false, error: "Tenant DTE config no existe" };

  const recipients = (config.alertEmails ?? []).filter(
    (e) => typeof e === "string" && e.includes("@"),
  );
  if (recipients.length === 0) {
    // No hay destinatarios configurados — skip silencioso.
    return { success: true, skipped: true };
  }

  const emailCfg = await getTenantEmailConfig(tenantId);
  const tipoNombre = DTE_TYPE_NAME[dte.dteType] ?? `Tipo ${dte.dteType}`;
  const totalCLP = Number(dte.totalAmount).toLocaleString("es-CL");
  const dateStr = dte.date.toISOString().split("T")[0];
  const subject = `⚠️ DTE rechazado por SII: ${tipoNombre} N° ${dte.folio}`;

  // Extraer detalle del rechazo del response SII si está disponible.
  const siiResp = dte.siiResponse as Record<string, unknown> | null;
  const detalleSii =
    typeof siiResp?.Estado === "string"
      ? String(siiResp.Estado)
      : typeof siiResp?.estado === "string"
        ? String(siiResp.estado)
        : "Sin detalle";

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
      <h2 style="margin: 0 0 8px 0; color: #991b1b; font-size: 18px;">⚠️ DTE rechazado por el SII</h2>
      <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
        El SII rechazó el siguiente documento. Es necesario corregirlo y
        emitir un nuevo DTE.
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 6px 0; color: #525252; width: 35%;">Tipo:</td><td style="padding: 6px 0; font-weight: 500;">${tipoNombre}</td></tr>
      <tr><td style="padding: 6px 0; color: #525252;">Folio:</td><td style="padding: 6px 0; font-family: monospace; font-weight: 500;">${dte.folio}</td></tr>
      <tr><td style="padding: 6px 0; color: #525252;">Fecha:</td><td style="padding: 6px 0;">${dateStr}</td></tr>
      <tr><td style="padding: 6px 0; color: #525252;">Receptor:</td><td style="padding: 6px 0;">${dte.receiverName}</td></tr>
      <tr><td style="padding: 6px 0; color: #525252;">RUT:</td><td style="padding: 6px 0; font-family: monospace;">${dte.receiverRut}</td></tr>
      <tr><td style="padding: 6px 0; color: #525252;">Total:</td><td style="padding: 6px 0; font-weight: 500;">$${totalCLP}</td></tr>
      ${dte.siiTrackId ? `<tr><td style="padding: 6px 0; color: #525252;">Track ID SII:</td><td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${dte.siiTrackId}</td></tr>` : ""}
    </table>

    <div style="background: #fafafa; padding: 12px; border-radius: 4px; margin-bottom: 24px;">
      <p style="margin: 0 0 4px 0; color: #525252; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detalle del rechazo</p>
      <p style="margin: 0; font-family: monospace; font-size: 13px;">${detalleSii}</p>
    </div>

    <p style="font-size: 13px; color: #525252; margin-bottom: 8px;">
      <strong>Próximos pasos:</strong>
    </p>
    <ol style="font-size: 13px; color: #525252; padding-left: 20px;">
      <li>Ingresar al portal SII y revisar el motivo exacto del rechazo</li>
      <li>Corregir el error en OPAI (datos del receptor, montos, etc)</li>
      <li>Emitir el DTE corregido — el folio rechazado NO se reutiliza</li>
    </ol>

    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
    <p style="font-size: 11px; color: #a3a3a3; margin: 0;">
      Esta alerta fue generada por OPAI Suite — Facturación.<br/>
      Para cambiar los destinatarios, configurá los emails en
      /opai/configuracion/finanzas/dte (sección "Alertas").
    </p>
  </body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo || undefined,
      to: recipients,
      subject,
      html,
    });
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, messageId: result.data?.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
