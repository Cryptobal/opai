"use server";

import { prisma } from "@/lib/prisma";
import {
  resolveDocument,
  buildEmpresaEntityData,
  buildQuoteEnrichedData,
  buildContractEntityData,
} from "@/lib/docs/token-resolver";
import { nanoid } from "nanoid";

interface GenerateContractResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

export async function generateServiceContract(
  quoteId: string,
  tenantId: string,
  createdBy: string
): Promise<GenerateContractResult> {
  // 1. Load quote with relations
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      parameters: true,
      positions: {
        include: {
          puestoTrabajo: true,
          cargo: true,
        },
        orderBy: { createdAt: "asc" },
      },
      installation: true,
    },
  });

  if (!quote) return { success: false, error: "Cotización no encontrada" };
  if (!(quote as any).contractTemplateId) {
    return { success: false, error: "No hay template de contrato asignado a esta cotización" };
  }

  // 2. Load template
  const template = await prisma.docTemplate.findFirst({
    where: { id: (quote as any).contractTemplateId, tenantId },
  });

  if (!template) return { success: false, error: "Template de contrato no encontrado" };

  // 3. Load account and contact
  const account = quote.accountId
    ? await prisma.crmAccount.findUnique({ where: { id: quote.accountId } })
    : null;

  const contact = quote.contactId
    ? await prisma.crmContact.findUnique({ where: { id: quote.contactId } })
    : null;

  // 4. Load empresa settings
  const empresaSettings = await prisma.setting.findMany({
    where: { tenantId, key: { startsWith: "empresa." } },
  });

  // 5. Build enriched quote data
  const quoteEnriched = await buildQuoteEnrichedData(quoteId);

  // Merge with contract-specific fields from quote
  const quoteData = {
    ...quoteEnriched,
    adjustmentType: (quote as any).adjustmentType ?? "NONE",
    adjustmentFreq: (quote as any).adjustmentFreq ?? null,
    ipcWeight: (quote as any).ipcWeight ?? null,
    imoWeight: (quote as any).imoWeight ?? null,
    insurancePolicyUF: (quote as any).insurancePolicyUF != null ? Number((quote as any).insurancePolicyUF) : null,
    liabilityMonths: (quote as any).liabilityMonths ?? 3,
    hasCCTV: (quote as any).hasCCTV ?? false,
    cctvRetentionDays: (quote as any).cctvRetentionDays ?? 30,
    contractStartDate: (quote as any).contractStartDate ?? null,
    contractDuration: quote.contractDuration ?? 12,
    paymentDays: (quote as any).paymentDays ?? 5,
  };

  // 6. Calculate dates
  const startDate = quoteData.contractStartDate ? new Date(quoteData.contractStartDate) : new Date();
  const durationMonths = quoteData.contractDuration;
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  endDate.setDate(endDate.getDate() - 1);

  // 7. Build entity data for token resolution
  const entityData = {
    empresa: buildEmpresaEntityData(empresaSettings as Array<{ key: string; value: string }>),
    account: account ? { ...account } : null,
    contact: contact
      ? { ...contact, fullName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() }
      : null,
    installation: quote.installation ? { ...quote.installation } : null,
    quote: quoteData,
    contract: buildContractEntityData({
      title: `Contrato de Servicio — ${account?.name ?? quote.clientName ?? "Cliente"}`,
      effectiveDate: startDate.toISOString().slice(0, 10),
      expirationDate: endDate.toISOString().slice(0, 10),
      durationMonths,
    }),
  };

  // 8. Resolve tokens in template content
  const templateContent = template.content as { type: string; content: unknown[] };
  const { resolvedContent, tokenValues } = resolveDocument(templateContent, entityData);

  // 9. Define clause editability
  const clauseEditability: Record<string, boolean> = {
    PRIMERA: false,
    SEGUNDA: false,
    TERCERA: true,
    CUARTA: true,
    QUINTA: false,
    SEXTA: false,
    "SÉPTIMA": true,
    OCTAVA: false,
    NOVENA: true,
    "DÉCIMA": true,
    "UNDÉCIMA": true,
    "DUODÉCIMA": false,
    "DÉCIMA TERCERA": false,
    "DÉCIMA CUARTA": false,
    "DÉCIMA QUINTA": false,
    "DÉCIMA SEXTA": false,
  };

  // 10. Create Document
  const document = await prisma.document.create({
    data: {
      tenantId,
      templateId: template.id,
      title: `Contrato de Servicio — ${account?.name ?? quote.clientName ?? "Cliente"}`,
      content: resolvedContent,
      tokenValues: { ...entityData, resolved: tokenValues },
      module: "crm",
      category: "contrato_servicio",
      status: "draft",
      effectiveDate: startDate,
      expirationDate: endDate,
      alertDaysBefore: 60,
      portalVisible: true,
      contractClientToken: nanoid(32),
      contractMetadata: {
        quoteId: quote.id,
        clauseEditability,
        adjustmentType: quoteData.adjustmentType,
        adjustmentFreq: quoteData.adjustmentFreq,
        hasCCTV: quoteData.hasCCTV,
        currency: quote.currency,
      },
      createdBy,
    },
  });

  // 11. Create associations
  const associations: Array<{ documentId: string; entityType: string; entityId: string }> = [];
  if (quote.accountId) {
    associations.push({ documentId: document.id, entityType: "crm_account", entityId: quote.accountId });
  }
  if (quote.contactId) {
    associations.push({ documentId: document.id, entityType: "crm_contact", entityId: quote.contactId });
  }
  if (quote.installationId) {
    associations.push({ documentId: document.id, entityType: "crm_installation", entityId: quote.installationId });
  }
  if (quote.dealId) {
    associations.push({ documentId: document.id, entityType: "crm_deal", entityId: quote.dealId });
  }

  if (associations.length > 0) {
    await prisma.docAssociation.createMany({ data: associations });
  }

  // 12. Create history entry
  await prisma.docHistory.create({
    data: {
      documentId: document.id,
      action: "created",
      details: { source: "cpq_quote", quoteId: quote.id, quoteCode: quote.code },
      createdBy,
    },
  });

  return { success: true, documentId: document.id };
}
