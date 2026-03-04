/**
 * DTE Email Service
 * Send DTE documents via email using Resend
 */

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/**
 * Send DTE document via email
 */
export async function sendDteEmail(
  tenantId: string,
  dteId: string,
  recipientEmail?: string
) {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
  });
  if (!dte) throw new Error("DTE no encontrado");

  const email = recipientEmail ?? dte.receiverEmail;
  if (!email) throw new Error("No hay email de destino");

  const config = await getTenantCompanyConfig(tenantId);

  await resend.emails.send({
    from: config.emailFrom,
    replyTo: config.emailReplyTo,
    to: email,
    subject: `Documento Tributario Electrónico - ${dte.code}`,
    html: `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Envío de Documento Tributario Electrónico</h2>
        <p>Adjunto envío DTE <strong>${dte.code}</strong> emitido por <strong>${dte.issuerName}</strong>.</p>
      </div>
    `,
  });

  return { sent: true, email, dteCode: dte.code };
}
