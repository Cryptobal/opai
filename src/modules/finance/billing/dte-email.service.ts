/**
 * DTE Email Service
 * Send DTE documents via email using Resend
 */

import { prisma } from "@/lib/prisma";

/**
 * Send DTE document via email
 * TODO: Integrate with Resend when email templates are set up
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

  // TODO: Implement actual email sending via Resend
  // For now, just log the intent
  console.log(`[DTE Email] Would send DTE ${dte.code} to ${email}`);

  return { sent: true, email, dteCode: dte.code };
}
