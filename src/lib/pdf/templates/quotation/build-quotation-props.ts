/**
 * Shared logic to load quote data and build QuotationPDF props.
 * Used by export-pdf and send-email routes.
 */

import { prisma } from '@/lib/prisma';
import { formatCurrency, formatUFSuffix } from '@/lib/utils';
import { getUfValue, clpToUf } from '@/lib/uf';
import { computeCpqQuoteCosts } from '@/modules/cpq/costing/compute-quote-costs';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import type { QuotationPDFProps } from './render-quotation';

export async function buildQuotationProps(
  quoteId: string,
  tenantId: string,
): Promise<QuotationPDFProps & { fileName: string }> {
  // Load quote with relations
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      positions: {
        include: { cargo: true, rol: true, puestoTrabajo: true },
      },
      parameters: true,
      installation: true,
    },
  });

  if (!quote) throw new Error('Quote not found');

  // CRM context
  let contactName = '';
  if (quote.contactId) {
    const contact = await prisma.crmContact.findUnique({
      where: { id: quote.contactId },
      select: { firstName: true, lastName: true },
    });
    if (contact) contactName = `${contact.firstName} ${contact.lastName}`.trim();
  }

  let dealName = '';
  if (quote.dealId) {
    const deal = await prisma.crmDeal.findUnique({
      where: { id: quote.dealId },
      select: { title: true },
    });
    if (deal) dealName = deal.title;
  }

  // Additional lines
  const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({
    where: { quoteId: quoteId },
    orderBy: { orden: 'asc' },
  });
  const totalAdditionalLines = additionalLines.reduce(
    (sum, l) => sum + Number(l.precio),
    0,
  );

  // Costs
  let summary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    summary = await computeCpqQuoteCosts(quoteId);
  } catch {
    // proceed without summary
  }

  // Pricing parameters
  const marginPct = Number(quote.parameters?.marginPct ?? 13);
  const margin = marginPct / 100;
  const financialRatePctVal = Number(quote.parameters?.financialRatePct ?? 2.5);
  const policyRatePctVal = Number(quote.parameters?.policyRatePct ?? 0);
  const policyContractMonthsVal = Number(quote.parameters?.policyContractMonths ?? 12);
  const policyContractPctVal = Number(quote.parameters?.policyContractPct ?? 100);
  const contractMonthsVal = Number(quote.parameters?.contractMonths ?? 12);
  const policyFactor =
    contractMonthsVal > 0
      ? (policyContractMonthsVal * (policyContractPctVal / 100)) / contractMonthsVal
      : 0;

  const totalGuards =
    summary?.totalGuards ??
    quote.positions.reduce(
      (s: number, p: { numGuards: number; numPuestos?: number }) =>
        s + p.numGuards * (p.numPuestos || 1),
      0,
    );

  const currency = (quote.currency || 'CLP') as 'CLP' | 'UF';
  const ufVal = currency === 'UF' ? await getUfValue() : 0;

  const fmt = (clp: number) =>
    currency === 'UF' && ufVal > 0
      ? formatUFSuffix(clpToUf(clp, ufVal))
      : formatCurrency(clp, 'CLP');

  // Additional costs (without financial/policy)
  const baseAdditionalCostsTotal = summary
    ? Math.max(
        0,
        (summary.monthlyExtras ?? 0) -
          (summary.monthlyFinancial ?? 0) -
          (summary.monthlyPolicy ?? 0),
      )
    : 0;

  // Position rows
  const positions = quote.positions.map(
    (pos: {
      customName?: string | null;
      puestoTrabajo?: { name: string } | null;
      numGuards: number;
      numPuestos?: number;
      startTime?: string | null;
      endTime?: string | null;
      weekdays?: string[] | null;
      monthlyPositionCost: unknown;
    }) => {
      const guardsInPos = pos.numGuards * (pos.numPuestos || 1);
      const proportion = totalGuards > 0 ? guardsInPos / totalGuards : 0;
      const additionalForPos = baseAdditionalCostsTotal * proportion;
      const totalCostPos = Number(pos.monthlyPositionCost) + additionalForPos;
      const bwm = margin < 1 ? totalCostPos / (1 - margin) : totalCostPos;
      const fc = bwm * (financialRatePctVal / 100);
      const pc = bwm * (policyRatePctVal / 100) * policyFactor;
      const salePrice = bwm + fc + pc;

      return {
        name: pos.customName || pos.puestoTrabajo?.name || 'Puesto',
        guards: pos.numGuards,
        quantity: pos.numPuestos || 1,
        days: (pos.weekdays?.join(', ') || '-').replace(/,/g, ', '),
        schedule: `${pos.startTime || '-'} - ${pos.endTime || '-'}`,
        monthlyValue: fmt(salePrice),
      };
    },
  );

  // Total sale price
  let totalSalePrice = 0;
  if (summary) {
    const costsBase =
      summary.monthlyPositions +
      (summary.monthlyUniforms ?? 0) +
      (summary.monthlyExams ?? 0) +
      (summary.monthlyMeals ?? 0) +
      (summary.monthlyVehicles ?? 0) +
      (summary.monthlyInfrastructure ?? 0) +
      (summary.monthlyCostItems ?? 0);
    const baseWithMargin = margin < 1 ? costsBase / (1 - margin) : costsBase;
    totalSalePrice =
      baseWithMargin +
      (summary.monthlyFinancial ?? 0) +
      (summary.monthlyPolicy ?? 0);
  }

  const grandTotal = totalSalePrice + totalAdditionalLines;

  // Company config
  const companyConfig = await getTenantCompanyConfig(tenantId);

  const props: QuotationPDFProps = {
    quote: {
      code: quote.code,
      name: quote.name || undefined,
      validUntil: quote.validUntil?.toISOString(),
      currency,
      createdAt: quote.createdAt.toISOString(),
    },
    client: {
      name: quote.clientName || contactName || 'Cliente',
      dealName: dealName || undefined,
      installationName: quote.installation?.name || undefined,
    },
    positions,
    additionalServices: additionalLines.map((l) => ({
      product: String(l.nombre),
      description: l.descripcion ? String(l.descripcion) : '-',
      monthlyValue: fmt(Number(l.precio)),
    })),
    totals: {
      subtotalGuards: fmt(totalSalePrice),
      subtotalAdditional: fmt(totalAdditionalLines),
      totalNet: grandTotal > 0 ? fmt(grandTotal) : 'N/A',
    },
    conditions: {
      paymentTerms: quote.paymentTerms || 'contrafactura',
      serviceStartDays: quote.serviceStartDays ?? 5,
      contractDuration: quote.contractDuration ?? 12,
    },
    companyConfig: {
      commercialName: companyConfig.commercialName,
      companyName: companyConfig.companyName,
      email: companyConfig.email,
      phone: companyConfig.phone,
      website: companyConfig.website,
      repLegalNombre: companyConfig.repLegalNombre || undefined,
    },
    includedItems: quote.includedItems || [],
    aiDescription: quote.aiDescription || undefined,
    serviceDetail: quote.serviceDetail || undefined,
  };

  const fileName = `${quote.code}-propuesta.pdf`;

  return { ...props, fileName };
}
