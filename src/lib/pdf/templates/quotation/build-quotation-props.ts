/**
 * Shared logic to load quote data and build QuotationPDF props.
 * Used by export-pdf and send-email routes.
 */

import { prisma } from '@/lib/prisma';
import type { QuoteBreakdownData, PositionBreakdownItem } from '@/types/cpq-breakdown';

/** Remove common AI artifacts from aiDescription (headers, metadata) for display */
function sanitizeAiDescription(text: string | null | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  return text
    .replace(/^#\s*RESUMEN\s*EJECUTIVO\s*\n?/i, '')
    .replace(/^Resumen\s*Ejecutivo\s*\n?/i, '')
    .replace(/\n?\*\*Caracteres:\s*[\d.,]+\s*\|\s*Palabras:\s*[\d.]+\*\*\s*$/i, '')
    .replace(/\n?Caracteres:\s*[\d.,]+\s*\|\s*Palabras:\s*[\d.]+\s*$/i, '')
    .trim() || undefined;
}
import { formatCurrency, formatUFSuffix } from '@/lib/utils';
import { getUfValue, clpToUf } from '@/lib/uf';
import { computeCpqQuoteCosts } from '@/modules/cpq/costing/compute-quote-costs';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import type { ProposalTemplateSections } from '@/types/cpq';
import type { QuotationPDFProps, AdditionalLinePDF, LaborBreakdownPDF } from './render-quotation';
import { DEFAULT_TEMPLATE_SECTIONS, DEFAULT_COMPLIANCE_ITEMS } from './render-quotation';

export interface BuildQuotationOptions {
  templateSectionsOverride?: Partial<ProposalTemplateSections>;
}

const CANONICAL_SECTIONS: Record<string, Partial<ProposalTemplateSections>> = {
  standard: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: false, showCostSummaryByCategory: false, showLaborDetail: false,
    showEquipmentDetail: false, showVehicleDetail: false, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: false, numberedSections: false, headerStyle: 'standard',
  },
  detailed: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: true, showCostSummaryByCategory: true, showLaborDetail: true,
    showEquipmentDetail: true, showVehicleDetail: true, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: false, numberedSections: false, headerStyle: 'detailed',
  },
  tender: {
    showCoverPage: true, showCompanyIntro: true, showPositionsTable: true,
    showCostBreakdown: true, showCostSummaryByCategory: true, showLaborDetail: true,
    showEquipmentDetail: true, showVehicleDetail: true, showAdditionalServices: true,
    showConditions: true, showIncludedItems: true, showSignature: true,
    showComplianceSection: true, numberedSections: true, headerStyle: 'formal',
  },
};

const SLUG_ALIASES: Record<string, string> = {
  estandar: 'standard', estándar: 'standard', standard: 'standard',
  detallado: 'detailed', detailed: 'detailed',
  licitacion: 'tender', licitación: 'tender', tender: 'tender',
};

export function resolveCanonicalSections(
  slug: string | null | undefined,
): Partial<ProposalTemplateSections> | undefined {
  if (!slug) return undefined;
  const canonical = SLUG_ALIASES[slug.toLowerCase()];
  return canonical ? CANONICAL_SECTIONS[canonical] : undefined;
}

export async function buildQuotationProps(
  quoteId: string,
  tenantId: string,
  options?: BuildQuotationOptions,
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
      proposalTemplate: true,
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

  // Costs
  let summary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    summary = await computeCpqQuoteCosts(quoteId);
  } catch {
    // proceed without summary
  }

  const totalAdditionalLines = summary
    ? summary.additionalLinesTotalWithMargin
    : additionalLines.reduce((sum, l) => sum + Number(l.precio), 0);

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

  let totalSalePrice = 0;
  if (summary) {
    totalSalePrice =
      (summary.baseWithMargin ?? 0) +
      (summary.monthlyFinancial ?? 0) +
      (summary.monthlyPolicy ?? 0);
  }

  const grandTotal = totalSalePrice + totalAdditionalLines;

  // Company config
  const companyConfig = await getTenantCompanyConfig(tenantId);

  /* ── Cost category breakdown ── */
  let breakdown: QuoteBreakdownData | undefined;
  try {
    if (summary) {
      const marginPct = Number(quote.parameters?.marginPct ?? 13);
      const margin = marginPct / 100;
      const financialRatePctVal = Number(quote.parameters?.financialRatePct ?? 2.5);
      const policyRatePctVal = Number(quote.parameters?.policyRatePct ?? 0);
      const monthlyHoursStandard = Number(quote.parameters?.monthlyHoursStandard ?? 180);

      const costItemsForBd = await prisma.cpqQuoteCostItem.findMany({
        where: { quoteId: quoteId },
        include: { catalogItem: true },
      });
      const normalizeUnit = (value: number, unit?: string | null) => {
        if (!unit) return value;
        const n = unit.toLowerCase();
        if (n.includes('año') || n.includes('year')) return value / 12;
        if (n.includes('semestre') || n.includes('semester')) return value / 6;
        return value;
      };
      const sumByType = (types: string[]) =>
        costItemsForBd.reduce((sum, item) => {
          if (!item.isEnabled) return sum;
          const cat = item.catalogItem;
          if (!cat || !types.includes(cat.type)) return sum;
          const base = Number(cat.basePrice || 0);
          const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
          const unitPrice = normalizeUnit(override ?? base, cat.unit);
          const qty = Number(item.quantity ?? 1);
          if (item.calcMode === 'per_guard') return sum + unitPrice * qty * totalGuards;
          return sum + unitPrice * qty;
        }, 0);

      const subtotalBase = summary.costsBase ?? (
        summary.monthlyPositions +
        summary.monthlyHolidayAdjustment +
        summary.monthlyUniforms +
        summary.monthlyExams +
        summary.monthlyMeals +
        summary.monthlyVehicles +
        summary.monthlyInfrastructure +
        summary.monthlyCostItems
      );
      const marginAmount = totalSalePrice - subtotalBase - summary.monthlyFinancial - summary.monthlyPolicy;

      const totalPositionCosts = quote.positions.reduce(
        (s: number, p: { monthlyPositionCost: unknown }) => s + Number(p.monthlyPositionCost ?? 0),
        0,
      );
      const fallback = quote.positions.length > 0 ? 1 / quote.positions.length : 0;

      const positionItems: PositionBreakdownItem[] = quote.positions.map(
        (pos: {
          id: string;
          customName?: string | null;
          puestoTrabajo?: { name: string } | null;
          numGuards: number;
          numPuestos?: number;
          monthlyPositionCost: unknown;
          baseSalary: unknown;
          payrollSnapshot?: unknown;
        }) => {
          const snap = pos.payrollSnapshot as Record<string, unknown> | null;
          const bd = (snap?.breakdown ?? {}) as Record<string, unknown>;
          const costClp = Number(pos.monthlyPositionCost ?? 0);
          const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallback;
          const salePrice = totalSalePrice * proportion;
          const totalGuardsInPos = Math.max(1, pos.numGuards) * Math.max(1, pos.numPuestos ?? 1);

          const getNum = (key: string) => Number(bd[key] ?? 0) * totalGuardsInPos;
          const getNestedNum = (key: string, sub: string) => {
            const val = bd[key] as Record<string, unknown> | undefined;
            return Number(val?.[sub] ?? 0) * totalGuardsInPos;
          };

          const baseSalary = getNum('base_salary') || Number(pos.baseSalary ?? 0) * totalGuardsInPos;
          const gratification = getNum('gratification');
          const totalImponible = getNum('total_taxable_income') || baseSalary + gratification;

          return {
            id: pos.id,
            name: pos.customName || pos.puestoTrabajo?.name || 'Puesto',
            numGuards: pos.numGuards,
            numPuestos: pos.numPuestos ?? 1,
            totalGuardsInPosition: totalGuardsInPos,
            baseSalary,
            gratification,
            totalImponible,
            sisEmployer: getNum('sis_employer'),
            afcEmployer: getNestedNum('afc_employer', 'total'),
            mutualEmployer: getNestedNum('work_injury_employer', 'amount'),
            vacationProvision: getNum('vacation_provision'),
            severanceProvision: getNum('severance_provision'),
            totalLaborCost: costClp,
            salePrice,
            hourlyRateSale:
              totalGuardsInPos > 0 && monthlyHoursStandard > 0
                ? salePrice / (totalGuardsInPos * monthlyHoursStandard)
                : 0,
          };
        },
      );

      breakdown = {
        positions: positionItems,
        totalLaborCost: summary.monthlyPositions,
        holidayAdjustment: summary.monthlyHolidayAdjustment,
        uniforms: summary.monthlyUniforms,
        exams: summary.monthlyExams,
        meals: summary.monthlyMeals,
        vehicles: summary.monthlyVehicles,
        infrastructure: summary.monthlyInfrastructure,
        equipment: sumByType(['phone', 'radio', 'flashlight']),
        transport: sumByType(['transport']),
        systems: sumByType(['system']),
        subtotalBase,
        marginPct,
        marginAmount,
        financial: summary.monthlyFinancial,
        financialRatePct: financialRatePctVal,
        policy: summary.monthlyPolicy,
        policyRatePct: policyRatePctVal,
        totalSalePrice,
        additionalLines: totalAdditionalLines,
        grandTotal,
        monthlyHoursStandard,
        currency,
        ufValue: ufVal > 0 ? ufVal : undefined,
      };
    }
  } catch {
    // Non-critical
  }

  /* ── Template sections ── */
  const dbSections = (quote.proposalTemplate?.sections ?? {}) as Partial<ProposalTemplateSections>;
  const dbSectionsEmpty = Object.keys(dbSections).length === 0;
  const slugFallback = resolveCanonicalSections(
    (quote.proposalTemplate as { slug?: string } | null)?.slug
  );
  const effectiveSections = options?.templateSectionsOverride
    ?? (dbSectionsEmpty && slugFallback ? slugFallback : dbSections);
  const templateSections: ProposalTemplateSections = { ...DEFAULT_TEMPLATE_SECTIONS, ...effectiveSections };

  /* ── CostsByCategory from summary ── */
  const costsByCategory = summary?.costsByCategory ?? [];

  /* ── Additional lines with extended fields ── */
  const additionalLinesPDF: AdditionalLinePDF[] = (summary?.additionalLinesDetails ?? []).map((d) => ({
    nombre: d.nombre,
    descripcion: additionalLines.find((l) => l.id === d.id)?.descripcion || undefined,
    tipo: d.tipo,
    recurrencia: d.recurrencia,
    precioMensual: d.precioBase,
    marginPct: d.marginPct,
    precioVenta: d.precioConMargen,
    precioVentaFmt: fmt(d.precioConMargen),
  }));

  /* ── Labor breakdown (for detailed/tender templates) ── */
  let laborBreakdown: LaborBreakdownPDF | undefined;
  if (templateSections.showLaborDetail && breakdown && breakdown.positions.length > 0) {
    const totalImponible = breakdown.positions.reduce((s, p) => s + p.totalImponible, 0);
    const totalBaseSalary = breakdown.positions.reduce((s, p) => s + p.baseSalary, 0);
    const totalGratification = breakdown.positions.reduce((s, p) => s + p.gratification, 0);
    const totalImpositions = breakdown.positions.reduce(
      (s, p) => s + p.sisEmployer + p.afcEmployer + p.mutualEmployer, 0,
    );
    const posGuards = breakdown.positions.reduce((s, p) => s + p.totalGuardsInPosition, 0);
    const cargasSocialesPct = totalImponible > 0 ? (totalImpositions / totalImponible) * 100 : 0;

    laborBreakdown = {
      sueldoBrutoPromedio: posGuards > 0 ? totalBaseSalary / posGuards : 0,
      cargasSocialesPct: Math.round(cargasSocialesPct * 100) / 100,
      gratificacion: totalGratification,
      totalPorGuardia: posGuards > 0 ? breakdown.totalLaborCost / posGuards : 0,
      totalGuardias: posGuards,
      totalMensual: breakdown.totalLaborCost,
    };
  }

  /* ── Compliance items ── */
  let complianceItems: string[] | undefined;
  if (templateSections.showComplianceSection) {
    // TODO: load from tenant settings when available
    complianceItems = DEFAULT_COMPLIANCE_ITEMS;
  }

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
      brandNameUpper: companyConfig.brandNameUpper || undefined,
      logoUrl: companyConfig.brandingLogoWhite || companyConfig.brandingLogoFull || companyConfig.logoUrl || undefined,
    },
    includedItems: quote.includedItems || [],
    aiDescription: sanitizeAiDescription(quote.aiDescription),
    serviceDetail: quote.serviceDetail || undefined,
    breakdown,
    templateSections,
    costsByCategory,
    additionalLines: additionalLinesPDF,
    laborBreakdown,
    complianceItems,
  };

  const fileName = `${quote.code}-propuesta.pdf`;

  return { ...props, fileName };
}
