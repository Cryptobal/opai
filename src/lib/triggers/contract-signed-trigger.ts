/**
 * Trigger: Automatizaciones post-firma para contratos de servicio.
 * Se ejecuta cuando un DocSignatureRequest se completa y el documento tiene contractMetadata.
 */

import { prisma } from "@/lib/prisma";

interface ContractMetadata {
  quoteId: string;
  clauseEditability: Record<string, boolean>;
  adjustmentType: string;
  adjustmentFreq?: string | null;
  hasCCTV: boolean;
  currency: string;
}

export async function onServiceContractSigned(documentId: string, tenantId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { associations: true },
  });

  if (!document?.contractMetadata) return;

  const metadata = document.contractMetadata as unknown as ContractMetadata;

  const quote = await prisma.cpqQuote.findUnique({
    where: { id: metadata.quoteId },
    include: { installation: true, parameters: true },
  });

  if (!quote) return;

  // 1. Update Deal status to "won" (Cerrado Ganado)
  if (quote.dealId) {
    try {
      await prisma.crmDeal.update({
        where: { id: quote.dealId },
        data: { status: "won" },
      });
    } catch (e) {
      console.error("[contract-signed] Error updating deal status:", e);
    }
  }

  // 2. Update Account status to "client_active"
  if (quote.accountId) {
    try {
      await prisma.crmAccount.update({
        where: { id: quote.accountId },
        data: { status: "client_active" },
      });
    } catch (e) {
      console.error("[contract-signed] Error updating account status:", e);
    }
  }

  // 3. Update document status to "active" if effective date is today or past
  if (document.effectiveDate) {
    const effectiveDate = new Date(document.effectiveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveDate <= today && document.status !== "active") {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "active" },
      });

      await prisma.docHistory.create({
        data: {
          documentId,
          action: "status_changed",
          details: { from: document.status, to: "active", reason: "contract_signed_and_effective" },
          createdBy: "system",
        },
      });
    }
  }

  // 4. Create history entry for contract activation
  await prisma.docHistory.create({
    data: {
      documentId,
      action: "signed",
      details: {
        type: "service_contract_signed",
        quoteId: metadata.quoteId,
        dealId: quote.dealId,
        accountId: quote.accountId,
        adjustmentType: metadata.adjustmentType,
      },
      createdBy: "system",
    },
  });

  console.log(`[contract-signed] Service contract ${documentId} processed successfully`);
}
