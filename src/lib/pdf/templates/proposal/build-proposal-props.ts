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
  };
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
  const companyLogo = account?.logoUrl ?? undefined;

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
  const gardLogo = companyConfig.brandingLogoWhite || companyConfig.brandingLogoFull || companyConfig.logoUrl || `${baseUrl}/Logo Gard Blanco.png`;
  const opaiLogo = `${baseUrl}/opai-logo.png`;
  const lx3Logo = `${baseUrl}/lx3-logo.png`;

  const clientLogos: string[] = [];
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
      brandingLogoWhite: companyConfig.brandingLogoWhite || undefined,
      brandingLogoFull: companyConfig.brandingLogoFull || undefined,
    },
  };

  const fileName = `Propuesta-Tecnica-${companyName.replace(/\s+/g, '-')}-${quote.code}.pdf`;

  return { ...props, fileName };
}
