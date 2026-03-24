/**
 * Cuando se envía una propuesta/cotización (CPQ), el negocio se actualiza pero el
 * prospecto (CrmLead) puede seguir en pending/in_review. Esta función alinea el lead
 * a "approved" si podemos resolverlo de forma segura.
 *
 * Resolución del lead (en orden):
 * 1. CpqQuote.createdFromLeadId
 * 2. CrmInstallation.leadId vía quote.installationId
 * 3. CrmLead donde convertedDealId === dealId
 *
 * No modifica leads rechazados ni ya aprobados. No sobrescribe converted* existentes.
 * Falla en silencio (log) para no romper envíos de correo/portal.
 */

import { prisma } from "@/lib/prisma";

export type SyncLeadOnProposalSentParams = {
  tenantId: string;
  /** Usuario que dispara el envío; null en webhooks sin usuario */
  actingUserId: string | null;
  dealId: string | null;
  accountId: string | null;
  contactId: string | null;
  createdFromLeadId: string | null;
  installationId: string | null;
};

export async function syncLeadOnProposalSent(
  params: SyncLeadOnProposalSentParams
): Promise<void> {
  try {
    const {
      tenantId,
      actingUserId,
      dealId,
      accountId,
      contactId,
      createdFromLeadId,
      installationId,
    } = params;

    let leadId: string | null = createdFromLeadId;

    if (!leadId && installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: installationId, tenantId },
        select: { leadId: true },
      });
      leadId = inst?.leadId ?? null;
    }

    if (!leadId && dealId) {
      const byDeal = await prisma.crmLead.findFirst({
        where: { tenantId, convertedDealId: dealId },
        select: { id: true },
      });
      leadId = byDeal?.id ?? null;
    }

    if (!leadId) return;

    const lead = await prisma.crmLead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) return;

    if (lead.status === "rejected" || lead.status === "approved") return;

    const open = ["pending", "in_review", "new"];
    if (!open.includes(lead.status)) return;

    const now = new Date();
    const nextApprovedBy =
      lead.approvedBy ??
      (actingUserId && actingUserId.trim() !== "" ? actingUserId : null);

    await prisma.crmLead.update({
      where: { id: lead.id },
      data: {
        status: "approved",
        approvedAt: lead.approvedAt ?? now,
        ...(nextApprovedBy ? { approvedBy: nextApprovedBy } : {}),
        ...(!lead.convertedAccountId && accountId ? { convertedAccountId: accountId } : {}),
        ...(!lead.convertedContactId && contactId ? { convertedContactId: contactId } : {}),
        ...(!lead.convertedDealId && dealId ? { convertedDealId: dealId } : {}),
      },
    });
  } catch (e) {
    console.error("[CRM] syncLeadOnProposalSent:", e);
  }
}
