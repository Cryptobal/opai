/**
 * Carga datos de Prisma + genera contenido AI para Propuesta Técnica
 * Patrón: buildProposalProps(quotationId) → ProposalProps
 */

import { prisma } from '@/lib/prisma';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import { computeCpqQuoteCosts } from '@/modules/cpq/costing/compute-quote-costs';
import { formatCurrency, formatUFSuffix } from '@/lib/utils';
import { getUfValue, clpToUf } from '@/lib/uf';
import { generateProposalAIContent } from './proposal-ai';
import type { ProposalAIContent } from './proposal-ai';
import type { QuoteBreakdownData, PositionBreakdownItem } from '@/types/cpq-breakdown';

export interface ProposalProps {
  companyName: string;
  companyLogo?: string;
  quotationCode: string;
  proposalDate: string;
  contactName: string;
  contactPosition?: string;

  ai: ProposalAIContent;

  serviceType: string;
  installationName: string;
  installationAddress: string;
  coverageSchedule: string;
  staffingCount: number;
  staffingRegime: string;
  supervisionFrequency: string;

  items: Array<{
    index: number;
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    unitPriceFormatted: string;
    subtotalFormatted: string;
    specifications?: string;
  }>;
  totalNeto: number;
  totalNetoFormatted: string;
  currency: string;
  paymentTerms: string;
  validUntil?: string;

  gardLogo: string;
  opaiLogo: string;
  lx3Logo: string;
  clientLogos: string[];
  portalScreenshots: Record<string, string>;

  companyConfig: {
    commercialName: string;
    website: string;
    phone: string;
    email: string;
    brandingLogoWhite?: string;
    brandingLogoFull?: string;
    brandingLogoIcon?: string;
  };
  clientLogosWithNames: Array<{ name: string; url: string }>;

  companyStats: {
    yearsInOperation: string;
    activeGuards: string;
    protectedFacilities: string;
    regionsCount: string;
  };
  regimeExplanation: string;
  breakdown?: QuoteBreakdownData;
}

const PAYMENT_LABELS: Record<string, string> = {
  contrafactura: 'Mensual, contra entrega de factura',
  '30dias': '30 días',
  anticipado: 'Pago anticipado',
};

export async function buildProposalProps(
  quotationId: string,
  tenantId: string
): Promise<ProposalProps & { fileName: string }> {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quotationId, tenantId },
    include: {
      positions: {
        include: { cargo: true, rol: true, puestoTrabajo: true },
      },
      parameters: true,
      installation: true,
      costItems: { include: { catalogItem: true } },
      additionalLines: { orderBy: { orden: 'asc' } },
    },
  });

  if (!quote) throw new Error('Quote not found');

  const account = quote.accountId
    ? await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true, logoUrl: true, industry: true, segment: true },
      })
    : null;

  const contact = quote.contactId
    ? await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, lastName: true, roleTitle: true },
      })
    : null;

  const contactName = `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim() || quote.clientName || 'Cliente';
  const contactPosition = contact?.roleTitle ?? undefined;

  const companyName = account?.name ?? quote.clientName ?? 'Cliente';
  const companyLogoRaw = account?.logoUrl ?? undefined;

  const installation = quote.installation;
  const installationName = installation?.name ?? '-';
  const installationAddress = [installation?.address, installation?.city]
    .filter(Boolean)
    .join(', ') || '-';

  let costSummary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    costSummary = await computeCpqQuoteCosts(quotationId);
  } catch (err) {
    console.error('[Proposal] computeCpqQuoteCosts failed:', err);
  }

  const totalGuards = quote.totalGuards ?? quote.positions.reduce(
    (s, p) => s + p.numGuards * (p.numPuestos || 1),
    0
  );

  const currency = (quote.currency || 'CLP') as 'CLP' | 'UF';
  const ufVal = currency === 'UF' ? await getUfValue() : 0;
  const fmt = (clp: number) =>
    currency === 'UF' && ufVal > 0
      ? formatUFSuffix(clpToUf(clp, ufVal))
      : formatCurrency(clp, 'CLP');

  const monthlyTotal = costSummary?.monthlyTotal ?? Number(quote.monthlyCost) ?? 0;

  const totalAdditionalLines = costSummary?.additionalLinesTotalWithMargin ?? quote.additionalLines.reduce(
    (s, l) => s + Number(l.precio),
    0
  );

  const totalSalePrice = costSummary?.baseWithMargin ?? 0;
  const grandTotal = totalSalePrice + totalAdditionalLines;

  const positions = quote.positions;
  const totalPositionCosts = positions.reduce(
    (s, p) => s + Number(p.monthlyPositionCost ?? 0),
    0
  );

  const items: ProposalProps['items'] = [];
  let idx = 1;

  for (const pos of positions) {
    const guardsInPos = pos.numGuards * (pos.numPuestos || 1);
    const proportion = totalPositionCosts > 0 ? Number(pos.monthlyPositionCost) / totalPositionCosts : 1 / positions.length;
    const salePrice = totalSalePrice * proportion;
    const name = pos.customName || pos.puestoTrabajo?.name || 'Puesto';
    const schedule = `${pos.startTime || '-'} - ${pos.endTime || '-'}`;
    const days = (pos.weekdays?.join(', ') || '-').replace(/,/g, ', ');
    const unitPrice = guardsInPos > 0 ? salePrice / guardsInPos : salePrice;

    items.push({
      index: idx++,
      description: `${name} · ${guardsInPos} guardia(s) · ${days} · ${schedule}`,
      quantity: guardsInPos,
      unitPrice,
      subtotal: salePrice,
      unitPriceFormatted: fmt(unitPrice),
      subtotalFormatted: fmt(salePrice),
      specifications: undefined,
    });
  }

  for (const line of quote.additionalLines) {
    const precio = Number(line.precio);
    if (precio <= 0) continue;
    const pdfLine = costSummary?.additionalLinesDetails?.find((d) => d.nombre === line.nombre);
    const subTotal = pdfLine ? pdfLine.precioConMargen : precio;

    items.push({
      index: idx++,
      description: line.nombre,
      quantity: 1,
      unitPrice: subTotal,
      subtotal: subTotal,
      unitPriceFormatted: fmt(subTotal),
      subtotalFormatted: fmt(subTotal),
      specifications: line.descripcion ?? undefined,
    });
  }

  const serviceType = positions.length > 0
    ? positions.map((p) => p.customName || p.puestoTrabajo?.name || 'Puesto').join(', ')
    : 'Servicio de seguridad';

  const firstPos = positions[0];
  const coverageSchedule = firstPos
    ? `${firstPos.startTime || '08:00'} - ${firstPos.endTime || '20:00'}, ${(firstPos.weekdays || []).join(', ')}`
    : 'A definir';

  const staffingRegime = positions.length > 0
    ? positions.map((p) => `${p.numGuards}x${p.numPuestos || 1}`).join(' + ')
    : `${totalGuards} guardias`;

  const supervisionFrequency = 'Mínimo 2 supervisiones por turno';

  const regimeRaw = staffingRegime.toLowerCase();
  let regimeExplanation = '';
  if (regimeRaw.includes('4x4') || regimeRaw.includes('4×4')) {
    regimeExplanation =
      'El turno 4x4 (4 días trabajados, 4 días de descanso) es el esquema óptimo para turnos nocturnos: reduce el desgaste del personal, mantiene la alerta del guardia, y garantiza continuidad porque siempre hay equipo de reemplazo en rotación. La alternativa (turnos corridos o 7x7) genera mayor ausentismo y fatiga, comprometiendo la calidad del servicio.';
  } else if (regimeRaw.includes('5x2') || regimeRaw.includes('5×2')) {
    regimeExplanation =
      'El turno 5x2 (5 días de trabajo, 2 de descanso) es ideal para coberturas diurnas en horario de oficina. Permite continuidad operativa de lunes a viernes con descanso de fin de semana, alineado con la operación del cliente.';
  } else if (regimeRaw.includes('7x7') || regimeRaw.includes('7×7')) {
    regimeExplanation =
      'El turno 7x7 (7 días trabajados, 7 de descanso) ofrece bloques de cobertura continua, ideal para instalaciones remotas o servicios que requieren estabilidad por períodos extendidos.';
  }

  const paymentTerms = PAYMENT_LABELS[quote.paymentTerms ?? 'contrafactura'] ?? quote.paymentTerms ?? 'Mensual, contra entrega de factura';

  let validUntil: string | undefined;
  if (quote.validUntil) {
    const d = new Date(quote.validUntil);
    validUntil = d.toLocaleDateString('es-CL');
  } else {
    const d = new Date(quote.createdAt);
    d.setDate(d.getDate() + 60);
    validUntil = d.toLocaleDateString('es-CL');
  }

  const proposalDate = new Date().toLocaleDateString('es-CL');

  const companyConfig = await getTenantCompanyConfig(tenantId);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://opai.gard.cl';
  const abs = (url: string | undefined | null): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };
  const gardLogo = abs(companyConfig.brandingLogoWhite) || abs(companyConfig.brandingLogoFull) || abs(companyConfig.logoUrl) || `${baseUrl}/logo-gard-blanco.svg`;
  const companyLogo = companyLogoRaw ? abs(companyLogoRaw) : undefined;
  const opaiLogo = `${baseUrl}/opai-logo.png`;
  const lx3Logo = `${baseUrl}/lx3-logo.png`;

  const clientesConLogo = await prisma.crmAccount.findMany({
    where: {
      tenantId,
      status: 'client_active',
      logoUrl: { not: null },
    },
    select: { name: true, logoUrl: true },
    take: 20,
  });
  const clientLogos: string[] = clientesConLogo
    .filter((c) => c.logoUrl)
    .map((c) => c.logoUrl!);

  const portalScreenshots: Record<string, string> = {
    clientes: 'placeholder',
    guardias: 'placeholder',
    supervisores: 'placeholder',
    rondas: 'placeholder',
    acceso: 'placeholder',
    admin: 'placeholder',
  };

  let aiContent: ProposalAIContent;

  const cached = quote.proposalAiContent as ProposalAIContent | null | undefined;
  if (cached && typeof cached === 'object' && cached.descripcionBreve) {
    aiContent = cached;
  } else {
    const staffingDetails = `${totalGuards} guardias en régimen ${staffingRegime}`;
    aiContent = await generateProposalAIContent({
      companyName,
      companyIndustry: account?.industry ?? undefined,
      companySegment: account?.segment ?? undefined,
      contactName,
      contactPosition,
      serviceName: serviceType,
      staffingDetails,
      coverageSchedule,
      monthlyTotal: grandTotal,
      installationName,
      installationCity: installation?.city ?? undefined,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        specifications: i.specifications,
      })),
      existingAiDescription: quote.aiDescription ?? undefined,
    });

    await prisma.cpqQuote.update({
      where: { id: quotationId },
      data: {
        proposalAiContent: aiContent as object,
        proposalAiGeneratedAt: new Date(),
      },
    });
  }

  let breakdown: QuoteBreakdownData | undefined;
  try {
    if (costSummary) {
      const marginPct = Number(quote.parameters?.marginPct ?? 13);
      const financialRatePctVal = Number(quote.parameters?.financialRatePct ?? 2.5);
      const policyRatePctVal = Number(quote.parameters?.policyRatePct ?? 0);
      const monthlyHoursStandard = Number(quote.parameters?.monthlyHoursStandard ?? 180);

      const costItemsForBd = await prisma.cpqQuoteCostItem.findMany({
        where: { quoteId: quotationId },
        include: { catalogItem: true },
      });
      const normalizeUnit = (value: number, unit?: string | null) => {
        if (!unit) return value;
        const n = unit.toLowerCase();
        if (n.includes('contrato') || n.includes('contract')) return value / 12;
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

      const subtotalBase = costSummary.costsBase ?? (
        costSummary.monthlyPositions + costSummary.monthlyHolidayAdjustment +
        costSummary.monthlyUniforms + costSummary.monthlyExams + costSummary.monthlyMeals +
        costSummary.monthlyVehicles + costSummary.monthlyInfrastructure + costSummary.monthlyCostItems
      );
      const marginAmount = totalSalePrice - subtotalBase - costSummary.monthlyFinancial - costSummary.monthlyPolicy;
      const fallback = positions.length > 0 ? 1 / positions.length : 0;

      const positionItems: PositionBreakdownItem[] = positions.map((pos) => {
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
        let gratification = getNum('gratification');
        if (gratification === 0 && baseSalary > 0) {
          const perGuardSalary = baseSalary / totalGuardsInPos;
          const monthlyCap = (500000 * 4.75) / 12;
          gratification = Math.min(perGuardSalary * 0.25, monthlyCap) * totalGuardsInPos;
        }
        const totalImponible = getNum('total_taxable_income') || baseSalary + gratification;
        return {
          id: pos.id, name: pos.customName || pos.puestoTrabajo?.name || 'Puesto',
          numGuards: pos.numGuards, numPuestos: pos.numPuestos ?? 1,
          totalGuardsInPosition: totalGuardsInPos,
          baseSalary, gratification, totalImponible,
          sisEmployer: getNum('sis_employer'),
          afcEmployer: getNestedNum('afc_employer', 'total'),
          mutualEmployer: getNestedNum('work_injury_employer', 'amount'),
          vacationProvision: getNum('vacation_provision'),
          severanceProvision: getNum('severance_provision'),
          totalLaborCost: costClp, salePrice,
          hourlyRateSale: totalGuardsInPos > 0 && monthlyHoursStandard > 0
            ? salePrice / (totalGuardsInPos * monthlyHoursStandard) : 0,
        };
      });

      breakdown = {
        positions: positionItems,
        totalLaborCost: costSummary.monthlyPositions,
        holidayAdjustment: costSummary.monthlyHolidayAdjustment,
        uniforms: costSummary.monthlyUniforms, exams: costSummary.monthlyExams, meals: costSummary.monthlyMeals,
        vehicles: costSummary.monthlyVehicles, infrastructure: costSummary.monthlyInfrastructure,
        equipment: sumByType(['phone', 'radio', 'flashlight']),
        transport: sumByType(['transport']), systems: sumByType(['system']),
        subtotalBase, marginPct, marginAmount,
        financial: costSummary.monthlyFinancial, financialRatePct: financialRatePctVal,
        policy: costSummary.monthlyPolicy, policyRatePct: policyRatePctVal,
        totalSalePrice, additionalLines: totalAdditionalLines, grandTotal,
        monthlyHoursStandard, currency,
        ufValue: ufVal > 0 ? ufVal : undefined,
      };
    }
  } catch (err) {
    console.error('[Proposal] breakdown build failed:', err);
  }

  const props: ProposalProps = {
    companyName,
    companyLogo,
    quotationCode: quote.code,
    proposalDate,
    contactName,
    contactPosition,

    ai: aiContent,

    serviceType,
    installationName,
    installationAddress,
    coverageSchedule,
    staffingCount: totalGuards,
    staffingRegime,
    supervisionFrequency,

    items,
    totalNeto: grandTotal,
    totalNetoFormatted: fmt(grandTotal),
    currency: currency === 'UF' ? 'UF' : 'CLP',
    paymentTerms,
    validUntil,

    gardLogo,
    opaiLogo,
    lx3Logo,
    clientLogos,
    portalScreenshots,

    companyConfig: {
      commercialName: companyConfig.commercialName,
      website: companyConfig.website,
      phone: companyConfig.phone,
      email: companyConfig.email,
      brandingLogoWhite: abs(companyConfig.brandingLogoWhite) || undefined,
      brandingLogoFull: abs(companyConfig.brandingLogoFull) || undefined,
      brandingLogoIcon: abs(companyConfig.brandingLogoIcon) || undefined,
    },
    clientLogosWithNames: clientesConLogo
      .filter((c) => c.logoUrl)
      .map((c) => ({ name: c.name, url: abs(c.logoUrl)! })),

    companyStats: {
      yearsInOperation: '5+',
      activeGuards: '50+',
      protectedFacilities: '20+',
      regionsCount: '3+',
    },
    regimeExplanation,
    breakdown,
  };

  const fileName = `Propuesta-Tecnica-${companyName.replace(/\s+/g, '-')}-${quote.code}.pdf`;

  return { ...props, fileName };
}
