/**
 * Construye los props de una PRESENTACIÓN INSTITUCIONAL de empresa a partir
 * del mismo template de Propuesta Técnica (render-proposal), pero SIN valores
 * comerciales ni características del servicio (dotación, horarios, inversión).
 *
 * No depende de una cotización (CpqQuote): se arma solo con la configuración
 * del tenant + el nombre del cliente/contacto. Así el documento descargable en
 * el portal del cliente siempre refleja los cambios visuales del template.
 *
 * Patrón: buildInstitutionalPresentationProps(tenantId, input) → ProposalProps
 */

import { prisma } from '@/lib/prisma';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import { getCanonicalSiteUrl } from '@/lib/emails/site-url';
import { generateProposalAIContent } from './proposal-ai';
import type { ProposalAIContent } from './proposal-ai';
import type { ProposalProps } from './build-proposal-props';

export interface InstitutionalPresentationInput {
  /** Nombre de la empresa cliente (cuenta) a quien se le presenta. */
  companyName: string;
  /** Nombre del contacto destinatario (opcional). */
  contactName?: string;
  contactPosition?: string;
  /** Rubro/segmento del cliente, para enriquecer el contenido IA. */
  industry?: string | null;
  segment?: string | null;
  /** Descripción curada existente (si la hay) para respetarla en el intro IA. */
  existingAiDescription?: string | null;
}

export async function buildInstitutionalPresentationProps(
  tenantId: string,
  input: InstitutionalPresentationInput,
): Promise<ProposalProps & { fileName: string }> {
  const companyName = input.companyName?.trim() || 'Cliente';
  const contactName = input.contactName?.trim() || companyName;

  const companyConfig = await getTenantCompanyConfig(tenantId);

  const baseUrl = getCanonicalSiteUrl();
  const abs = (url: string | undefined | null): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const providerLogo =
    abs(companyConfig.brandingLogoWhite) ||
    abs(companyConfig.brandingLogoFull) ||
    abs(companyConfig.logoUrl) ||
    '';

  /* ── Logos de clientes activos (misma lógica que la Propuesta Técnica) ── */
  const allClientAccounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, logoUrl: true, status: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  const isActiveClient = (a: { status: string | null; isActive: boolean }) => {
    if (a.status === 'prospect') return false;
    if (a.status === 'client_active') return true;
    if (a.status === 'client_inactive') return false;
    return a.isActive === true;
  };
  const excludedClientIds = new Set<string>(
    (() => {
      try {
        const arr = JSON.parse(companyConfig.proposalExcludedAccountIds || '[]');
        return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
      } catch {
        return [];
      }
    })(),
  );
  const clientesConLogo = allClientAccounts
    .filter(isActiveClient)
    .filter((c) => !excludedClientIds.has(c.id));

  /* ── Contenido IA institucional (sin precios ni dotación) ── */
  let aiContent: ProposalAIContent;
  try {
    aiContent = await generateProposalAIContent(
      {
        institutional: true,
        companyName,
        companyIndustry: input.industry ?? undefined,
        companySegment: input.segment ?? undefined,
        contactName,
        contactPosition: input.contactPosition,
        serviceName: 'Servicio de seguridad integral',
        staffingDetails: '',
        coverageSchedule: '',
        monthlyTotal: 0,
        items: [],
        existingAiDescription: input.existingAiDescription ?? undefined,
        providerName: companyConfig.commercialName || undefined,
      },
      tenantId,
    );
  } catch {
    aiContent = {
      descripcionBreve: `Presentación institucional para ${companyName}`,
      resumenEjecutivo:
        `${companyConfig.commercialName || 'Nuestra empresa'} es tu partner de seguridad: personal capacitado, supervisión activa y la plataforma OPAI para visibilidad total en tiempo real.`,
      analisisNecesidades: '',
      sectoresRelevantes: [],
    };
  }

  const proposalDate = new Date().toLocaleDateString('es-CL');

  const props: ProposalProps = {
    variant: 'institutional',
    companyName,
    companyLogo: undefined,
    quotationCode: '',
    proposalDate,
    contactName,
    contactPosition: input.contactPosition,

    ai: aiContent,

    serviceType: 'Servicio de seguridad integral',
    installationName: '-',
    installationAddress: '-',
    serviceDetail: undefined,
    coverageSchedule: '',
    staffingCount: 0,
    staffingRegime: '',
    supervisionFrequency: '',

    items: [],
    totalNeto: 0,
    totalNetoFormatted: '',
    currency: 'CLP',
    paymentTerms: '',

    providerLogo,
    opaiLogo: `${baseUrl}/opai-logo.png`,
    lx3Logo: `${baseUrl}/lx3-logo.png`,
    clientLogos: clientesConLogo.filter((c) => c.logoUrl).map((c) => c.logoUrl!),
    portalScreenshots: {},

    companyConfig: {
      commercialName: companyConfig.commercialName || 'OPAI',
      companyName: companyConfig.companyName || '',
      brandNameUpper: companyConfig.brandNameUpper || (companyConfig.commercialName || 'OPAI').toUpperCase(),
      website: companyConfig.website || '',
      phone: companyConfig.phone || '',
      email: companyConfig.email || '',
      brandingLogoWhite: abs(companyConfig.brandingLogoWhite) || undefined,
      brandingLogoFull: abs(companyConfig.brandingLogoFull) || undefined,
      brandingLogoIcon: abs(companyConfig.brandingLogoIcon) || undefined,
    },
    clientLogosWithNames: clientesConLogo.map((c) => ({
      name: c.name,
      url: c.logoUrl ? abs(c.logoUrl) : '',
    })),

    companyStats: {
      yearsInOperation: companyConfig.proposalYearsInOperation || '',
      activeGuards: companyConfig.proposalActiveGuards || '',
      protectedFacilities: companyConfig.proposalProtectedFacilities || '',
      regionsCount: companyConfig.proposalRegionsCount || '',
    },
    proposalMetrics: [
      { value: companyConfig.proposalMetricIncidentReduction, label: 'Reducción de incidentes' },
      { value: companyConfig.proposalMetricRoundsCompliance, label: 'Cumplimiento de rondas' },
      { value: companyConfig.proposalMetricDocumented, label: 'Documentado' },
      { value: companyConfig.proposalMetricRenewalRate, label: 'Tasa de renovación' },
      { value: companyConfig.proposalMetricSatisfaction, label: 'Satisfacción (de 5.0)' },
    ].filter((m) => m.value && m.value.trim().length > 0),
    regimeExplanation: '',
    breakdown: undefined,
    resourceBreakdown: undefined,
    includedItems: [],
  };

  const safeName = companyName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'cliente';
  const fileName = `Presentacion-${safeName}.pdf`;

  return { ...props, fileName };
}
