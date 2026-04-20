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

  // 2. Load template — use assigned template, or fallback to default
  const templateId = (quote as any).contractTemplateId;
  const template = templateId
    ? await prisma.docTemplate.findFirst({ where: { id: templateId, tenantId } })
    : await prisma.docTemplate.findFirst({
        where: {
          tenantId,
          module: "crm",
          category: { in: ["contrato_servicio", "contrato_cliente"] },
          isActive: true,
          isDefault: true,
        },
      });

  if (!template) {
    return { success: false, error: "No hay template de contrato. Cree uno en Documentos > Plantillas con categoría 'Contrato de Servicio'." };
  }

  // 3. Load account (with relations — portal stores rep legal + personería in
  // AccountRepresentanteLegal and AccountPersoneria; the flat fields on
  // CrmAccount may lag if the portal sync didn't run, so we prefer relations.
  const account = quote.accountId
    ? await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        include: {
          representantesLegales: {
            select: { nombre: true, rut: true, email: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          personeria: {
            select: { notaria: true, fechaEscritura: true, tipoEscritura: true },
          },
        },
      })
    : null;

  const contact = quote.contactId
    ? await prisma.crmContact.findUnique({ where: { id: quote.contactId } })
    : null;

  // 4. Load empresa settings
  const empresaSettings = await prisma.setting.findMany({
    where: { tenantId, key: { startsWith: "empresa." } },
  });

  // 5. Build enriched quote data — buildQuoteEnrichedData loads UF internally.
  const quoteEnriched = await buildQuoteEnrichedData(quoteId);
  console.log("[generate-service-contract] currency=%s salePriceMonthly=%s salePriceUF=%s realAnnualIncrement=%s",
    quoteEnriched.currency, quoteEnriched.salePriceMonthly, quoteEnriched.salePriceUF, quoteEnriched.realAnnualIncrement);

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

  // 6. Calculate dates (UTC-safe: avoid TZ drift where new Date("2026-04-01")
  //    becomes the previous day in western timezones and then skews endDate).
  const durationMonths = quoteData.contractDuration;
  let startYear: number, startMonth: number, startDay: number;
  if (quoteData.contractStartDate) {
    const raw = typeof quoteData.contractStartDate === "string"
      ? quoteData.contractStartDate
      : quoteData.contractStartDate instanceof Date
      ? (quoteData.contractStartDate as Date).toISOString()
      : String(quoteData.contractStartDate);
    const m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      startYear = Number(m[1]);
      startMonth = Number(m[2]) - 1;
      startDay = Number(m[3]);
    } else {
      const d = new Date(raw);
      startYear = d.getUTCFullYear();
      startMonth = d.getUTCMonth();
      startDay = d.getUTCDate();
    }
  } else {
    const now = new Date();
    startYear = now.getUTCFullYear();
    startMonth = now.getUTCMonth();
    startDay = now.getUTCDate();
  }
  const startDate = new Date(Date.UTC(startYear, startMonth, startDay));
  const endDate = new Date(Date.UTC(startYear, startMonth + durationMonths, startDay));
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  // 7. Build entity data for token resolution
  // Merge relation fallbacks into flat account fields so {{account.legalRepresentativeName}},
  // {{account.notaryName}}, {{account.notaryDate}} resolve even if the portal sync didn't
  // backfill the flat columns.
  const accountMerged = account
    ? (() => {
        const firstRep = (account as any).representantesLegales?.[0];
        const pers = (account as any).personeria;
        let personeriaDateStr: string | null = null;
        if (pers?.fechaEscritura) {
          const iso = pers.fechaEscritura instanceof Date
            ? pers.fechaEscritura.toISOString()
            : String(pers.fechaEscritura);
          personeriaDateStr = iso.slice(0, 10);
        }
        return {
          ...account,
          legalRepresentativeName: account.legalRepresentativeName || firstRep?.nombre || null,
          legalRepresentativeRut: account.legalRepresentativeRut || firstRep?.rut || null,
          legalRepresentativeEmail: firstRep?.email ?? null,
          notaryName: account.notaryName || pers?.notaria || null,
          notaryDate: account.notaryDate || personeriaDateStr,
          notaryEscrituraType: pers?.tipoEscritura ?? null,
        };
      })()
    : null;

  const entityData = {
    empresa: buildEmpresaEntityData(empresaSettings as Array<{ key: string; value: string }>),
    account: accountMerged,
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
