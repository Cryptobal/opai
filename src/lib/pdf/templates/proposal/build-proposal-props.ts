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
import { buildCpqQuotePdfFileName } from '@/lib/pdf/cpq-quote-pdf-filename';
import { formatWeekdaysLong, formatCoverageSchedule } from '@/lib/cpq/weekdays';
import { resolveAccountLogo } from '@/lib/crm/account-logo';
import type { ProposalAIContent } from './proposal-ai';
import type { QuoteBreakdownData, PositionBreakdownItem, ResourceBreakdownCategory, ResourceBreakdownItem } from '@/types/cpq-breakdown';

export interface ProposalProps {
  /**
   * Variante del documento:
   * - 'technical' (default): Propuesta Técnica completa CON valores comerciales.
   * - 'institutional': Presentación de empresa SIN valores comerciales ni
   *   características del servicio (dotación, horarios, inversión). Mantiene
   *   todo el contenido institucional + el nombre del cliente.
   */
  variant?: 'technical' | 'institutional';
  companyName: string;
  companyLogo?: string;
  quotationCode: string;
  proposalDate: string;
  contactName: string;
  contactPosition?: string;

  ai: ProposalAIContent;

  serviceType: string;
  installationName: string;
  installationCity?: string;
  installationAddress: string;
  /** Detalle de servicio curado por el ejecutivo (qué incluye) — se muestra textual */
  serviceDetail?: string;
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
  ufValue?: number;
  paymentTerms: string;
  validUntil?: string;

  providerLogo: string;
  opaiLogo: string;
  lx3Logo: string;
  clientLogos: string[];
  portalScreenshots: Record<string, string>;

  companyConfig: {
    commercialName: string;
    companyName: string;
    brandNameUpper: string;
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
  /** Métricas de resultados configurables por tenant (vacío = se omiten, nunca inventar) */
  proposalMetrics?: Array<{ value: string; label: string }>;
  regimeExplanation: string;
  breakdown?: QuoteBreakdownData;
  resourceBreakdown?: ResourceBreakdownCategory[];
  includedItems?: string[];
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
        include: { cargo: true, rol: true, puestoTrabajo: true, serviceGroup: true },
      },
      serviceGroups: { orderBy: { displayOrder: 'asc' } },
      parameters: true,
      installation: true,
      costItems: { include: { catalogItem: true } },
      uniformItems: { include: { catalogItem: true } },
      examItems: { include: { catalogItem: true } },
      meals: true,
      vehicles: true,
      infrastructure: true,
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

  const totalSalePrice = (costSummary?.baseWithMargin ?? 0)
    + (costSummary?.monthlyFinancial ?? 0)
    + (costSummary?.monthlyPolicy ?? 0);
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
    const days = formatWeekdaysLong(pos.weekdays);
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

  // Nombres de servicio definidos por el ejecutivo en la matriz de puestos
  // (CpqServiceGroup). Se ignoran placeholders genéricos como "Servicio nuevo".
  const serviceGroupNames = (quote.serviceGroups ?? [])
    .map((g) => g.name?.trim())
    .filter((n): n is string => !!n && n.toLowerCase() !== 'servicio nuevo');

  const positionNames = positions.map((p) => p.customName || p.puestoTrabajo?.name || 'Puesto');

  // serviceType (mostrado en el PDF): preferir los nombres de servicio del
  // ejecutivo; si no hay, derivar de los puestos.
  const serviceType = serviceGroupNames.length > 0
    ? serviceGroupNames.join(', ')
    : positionNames.length > 0
      ? positionNames.join(', ')
      : 'Servicio de seguridad';

  // Desglose detallado por servicio para que la IA infiera el alcance con
  // precisión: cada grupo nombrado con sus puestos, dotación y horario.
  const serviceNameForAi = (() => {
    const groups = quote.serviceGroups ?? [];
    if (groups.length === 0) return serviceType;
    const lines = groups.map((g) => {
      const groupPositions = positions.filter((p) => p.serviceGroupId === g.id);
      const posDesc = groupPositions
        .map((p) => {
          const pn = p.customName || p.puestoTrabajo?.name || 'Puesto';
          const guards = p.numGuards * (p.numPuestos || 1);
          const schedule = `${p.startTime || '-'}-${p.endTime || '-'}`;
          return `${pn} (${guards} guardia(s), ${schedule})`;
        })
        .join('; ');
      return `${g.name}${posDesc ? `: ${posDesc}` : ''}`;
    });
    // Puestos sin grupo, si los hubiera.
    const ungrouped = positions.filter((p) => !p.serviceGroupId);
    if (ungrouped.length > 0) {
      lines.push(
        `Otros: ${ungrouped.map((p) => p.customName || p.puestoTrabajo?.name || 'Puesto').join('; ')}`,
      );
    }
    return lines.join(' | ') || serviceType;
  })();

  const coverageSchedule = formatCoverageSchedule(
    positions.map((p) => ({
      startTime: p.startTime,
      endTime: p.endTime,
      weekdays: p.weekdays,
    })),
  );

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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '';
  const abs = (url: string | undefined | null): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };
  const providerLogo = abs(companyConfig.brandingLogoWhite) || abs(companyConfig.brandingLogoFull) || abs(companyConfig.logoUrl) || '';
  const companyLogo = companyLogoRaw ? abs(companyLogoRaw) : undefined;
  const opaiLogo = `${baseUrl}/opai-logo.png`;
  const lx3Logo = `${baseUrl}/lx3-logo.png`;

  // Cliente activo = misma lógica que la UI de Cuentas (getLifecycle):
  // status 'client_active', o (sin status canónico) isActive=true.
  const allClientAccounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, logoUrl: true, notes: true, status: true, isActive: true },
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
    })()
  );
  // No incluir la cuenta de la propia empresa (tenant) en su muro de clientes.
  const selfNames = new Set(
    [companyConfig.commercialName, companyConfig.companyName, companyConfig.brandNameUpper]
      .filter(Boolean)
      .map((n) => String(n).trim().toLowerCase()),
  );
  const clientesActivos = allClientAccounts
    .filter(isActiveClient)
    .filter((c) => !excludedClientIds.has(c.id))
    .filter((c) => !selfNames.has(c.name.trim().toLowerCase()))
    .map((c) => ({ name: c.name, logo: resolveAccountLogo(c) ?? null }));
  // Resuelve el logo desde columna `logoUrl` O el marcador en `notes`.
  const clientesConLogo = clientesActivos;
  const clientLogos: string[] = clientesActivos
    .filter((c) => c.logo)
    .map((c) => abs(c.logo!));

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
      serviceName: serviceNameForAi,
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
      existingServiceDetail: quote.serviceDetail ?? undefined,
      providerName: companyConfig.commercialName || undefined,
    }, tenantId);

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
        vehicles: costSummary.monthlyVehicles + sumByType(['vehicle_rent', 'vehicle_fuel', 'vehicle_tag']),
        infrastructure: costSummary.monthlyInfrastructure + sumByType(['infrastructure', 'fuel']),
        equipment: sumByType(['phone', 'radio', 'flashlight']),
        transport: sumByType(['transport']), systems: sumByType(['system']),
        other: sumByType(['other']),
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

  /* ── Build resource breakdown with individual items + specs ── */
  let resourceBreakdown: ResourceBreakdownCategory[] | undefined;
  try {
    const categories: ResourceBreakdownCategory[] = [];
    const contractDur = quote.contractDuration ?? 12;
    const avgStayMonths = Number(quote.parameters?.avgStayMonths ?? 4);
    const uniformChangesPerYear = Number(quote.parameters?.uniformChangesPerYear ?? 3);
    const safeNum = (v: unknown) => Number(v || 0);
    const normalizeUnit = (value: number, unit?: string | null) => {
      if (!unit) return value;
      const n = unit.toLowerCase();
      if (n.includes('contrato') || n.includes('contract')) return value / contractDur;
      if (n.includes('año') || n.includes('year')) return value / 12;
      if (n.includes('semestre') || n.includes('semester')) return value / 6;
      return value;
    };

    /* — Uniformes — */
    const activeUniforms = (quote.uniformItems ?? []).filter((u) => u.active);
    if (activeUniforms.length > 0) {
      const items: ResourceBreakdownItem[] = activeUniforms.map((u) => {
        const base = safeNum(u.catalogItem?.basePrice);
        const override = u.unitPriceOverride != null ? safeNum(u.unitPriceOverride) : null;
        const price = normalizeUnit(override ?? base, u.catalogItem?.unit);
        const logic = (u as Record<string, unknown>).priceLogic as string ?? u.catalogItem?.priceLogic ?? 'uniform';
        const monthlyPerGuard = logic === 'prorated' ? price : (price * uniformChangesPerYear) / 12;
        return {
          name: u.catalogItem?.name ?? 'Uniforme',
          amount: monthlyPerGuard * totalGuards,
          quantity: totalGuards,
          unit: 'por guardia/mes',
          technicalSpecs: u.technicalSpecs ?? u.catalogItem?.defaultTechnicalSpecs ?? null,
        };
      });
      categories.push({ category: 'Uniformes', categoryType: 'direct', items, subtotal: items.reduce((s, i) => s + i.amount, 0) });
    }

    /* — Exámenes Médicos — */
    const activeExams = (quote.examItems ?? []).filter((ex) => ex.active);
    if (activeExams.length > 0) {
      const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
      const examFrequency = Math.max(examEntriesPerYear, uniformChangesPerYear);
      const items: ResourceBreakdownItem[] = activeExams.map((ex) => {
        const base = safeNum(ex.catalogItem?.basePrice);
        const override = ex.unitPriceOverride != null ? safeNum(ex.unitPriceOverride) : null;
        const unitPrice = normalizeUnit(override ?? base, ex.catalogItem?.unit);
        const monthly = totalGuards > 0 ? ((unitPrice * examFrequency) / 12) * totalGuards : 0;
        return {
          name: ex.catalogItem?.name ?? 'Examen',
          amount: monthly,
          quantity: totalGuards,
          unit: 'por guardia/mes',
          technicalSpecs: ex.technicalSpecs ?? ex.catalogItem?.defaultTechnicalSpecs ?? null,
        };
      });
      categories.push({ category: 'Exámenes Médicos', categoryType: 'direct', items, subtotal: items.reduce((s, i) => s + i.amount, 0) });
    }

    /* — Alimentación — */
    const activeMeals = (quote.meals ?? []).filter((m) => m.isEnabled);
    if (activeMeals.length > 0) {
      const mealCatalog = await prisma.cpqCatalogItem.findMany({
        where: { type: 'meal', active: true, OR: [{ tenantId }, { tenantId: null }] },
      });
      const mealMap = new Map(mealCatalog.map((m) => [m.name.toLowerCase(), m]));
      const items: ResourceBreakdownItem[] = activeMeals.map((m) => {
        const catalogItem = mealMap.get(m.mealType.toLowerCase());
        const base = safeNum(catalogItem?.basePrice);
        const override = m.priceOverride != null ? safeNum(m.priceOverride) : null;
        const price = normalizeUnit(override ?? base, catalogItem?.unit);
        const monthly = price * m.mealsPerDay * m.daysOfService;
        return {
          name: m.mealType, amount: monthly, quantity: m.mealsPerDay,
          unit: `${m.mealsPerDay} comidas/día × ${m.daysOfService} días`,
          technicalSpecs: m.technicalSpecs ?? catalogItem?.defaultTechnicalSpecs ?? null,
        };
      });
      categories.push({ category: 'Alimentación', categoryType: 'direct', items, subtotal: items.reduce((s, i) => s + i.amount, 0) });
    }

    /* — Vehículos (tabla separada: cpqQuoteVehicle) — */
    const activeVehicles = (quote.vehicles ?? []).filter((v) => v.isEnabled);
    if (activeVehicles.length > 0) {
      const items: ResourceBreakdownItem[] = activeVehicles.map((v, vi) => {
        const kmPerDay = safeNum(v.kmPerDay);
        const daysPerMonth = safeNum(v.daysPerMonth);
        const kmPerLiter = safeNum(v.kmPerLiter);
        const liters = kmPerLiter > 0 ? (kmPerDay * daysPerMonth) / kmPerLiter : 0;
        const fuelCost = liters * safeNum(v.fuelPrice);
        const vehicleMonthly = safeNum(v.rentMonthly) + safeNum(v.maintenanceMonthly) + fuelCost;
        const total = vehicleMonthly * v.vehiclesCount;
        const specs = [
          safeNum(v.rentMonthly) > 0 ? `Arriendo: $${Math.round(safeNum(v.rentMonthly)).toLocaleString('es-CL')}/mes` : null,
          safeNum(v.maintenanceMonthly) > 0 ? `Mantención: $${Math.round(safeNum(v.maintenanceMonthly)).toLocaleString('es-CL')}/mes` : null,
          kmPerDay > 0 ? `${kmPerDay} km/día · ${daysPerMonth} días/mes` : null,
          fuelCost > 0 ? `Combustible: $${Math.round(fuelCost).toLocaleString('es-CL')}/mes` : null,
        ].filter(Boolean).join(' · ');
        return {
          name: `Vehículo ${vi + 1} (×${v.vehiclesCount})`,
          amount: total,
          quantity: v.vehiclesCount,
          unit: `${v.vehiclesCount} unidad(es)`,
          technicalSpecs: specs || null,
        };
      });
      categories.push({ category: 'Vehículos', categoryType: 'indirect', items, subtotal: items.reduce((s, i) => s + i.amount, 0) });
    }

    /* — Infraestructura (tabla separada: cpqQuoteInfrastructure) — */
    /* Si el mismo ítem existe como costItem de catálogo (infra/combustible), no duplicar:
     * la fila legacy solo muestra arriendo/combustible calculado y oculta las especificaciones
     * técnicas editadas en el costItem. */
    const infraCostItemNames = new Set(
      (quote.costItems ?? [])
        .filter(
          (ci) =>
            ci.isEnabled &&
            ci.catalogItem &&
            ["infrastructure", "fuel"].includes(ci.catalogItem.type)
        )
        .map((ci) => (ci.customName ?? ci.catalogItem?.name ?? "").trim().toLowerCase())
        .filter((n) => n.length > 0)
    );
    const activeInfra = (quote.infrastructure ?? []).filter(
      (inf) =>
        inf.isEnabled &&
        !infraCostItemNames.has((inf.itemType || "").trim().toLowerCase())
    );
    if (activeInfra.length > 0) {
      const items: ResourceBreakdownItem[] = activeInfra.map((inf) => {
        const base = safeNum(inf.rentMonthly);
        let fuelCost = 0;
        if (inf.hasFuel) {
          const liters = safeNum(inf.fuelLitersPerHour) * safeNum(inf.fuelHoursPerDay) * safeNum(inf.fuelDaysPerMonth);
          fuelCost = liters * safeNum(inf.fuelPrice);
        }
        const total = (base + fuelCost) * inf.quantity;
        const specs = [
          base > 0 ? `Arriendo: $${Math.round(base).toLocaleString('es-CL')}/mes` : null,
          fuelCost > 0 ? `Combustible: $${Math.round(fuelCost).toLocaleString('es-CL')}/mes` : null,
        ].filter(Boolean).join(' · ');
        return {
          name: inf.itemType || 'Infraestructura',
          amount: total,
          quantity: inf.quantity,
          unit: `${inf.quantity} unidad(es)`,
          technicalSpecs: specs || null,
        };
      });
      categories.push({ category: 'Infraestructura', categoryType: 'indirect', items, subtotal: items.reduce((s, i) => s + i.amount, 0) });
    }

    /* — Cost items agrupados por tipo (cpqQuoteCostItem) — */
    const dbCategories = await prisma.cpqCostCategory.findMany({
      where: { active: true, OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { sortOrder: 'asc' },
    }).catch(() => [] as Array<{ slug: string; name: string; type: string }>);
    const catBySlug = new Map(dbCategories.map((c) => [c.slug, c]));

    const slugToTypes: Record<string, string[]> = {
      operational: ['phone', 'radio', 'flashlight'],
      system: ['system'],
      transport: ['transport'],
      vehicle: ['vehicle_rent', 'vehicle_fuel', 'vehicle_tag'],
      infrastructure: ['infrastructure', 'fuel'],
      other: ['other'],
    };
    const typeToSlug = new Map<string, string>();
    for (const [slug, types] of Object.entries(slugToTypes)) {
      for (const t of types) typeToSlug.set(t, slug);
    }
    const fallbackNames: Record<string, string> = {
      operational: 'Equipos Operativos', system: 'Sistemas', transport: 'Transporte',
      vehicle: 'Vehículos', infrastructure: 'Infraestructura', other: 'Otros Costos',
    };

    const excludeTypes = new Set(['uniform', 'exam', 'meal', 'financial', 'policy']);

    const findOrCreateCat = (catName: string, catType: 'direct' | 'indirect') => {
      let existing = categories.find((c) => c.category.toLowerCase() === catName.toLowerCase());
      if (!existing) {
        existing = { category: catName, categoryType: catType, items: [], subtotal: 0 };
        categories.push(existing);
      }
      return existing;
    };

    for (const ci of (quote.costItems ?? [])) {
      if (!ci.isEnabled) continue;
      const itemType = (ci as Record<string, unknown>).customType as string ?? ci.catalogItem?.type ?? 'other';
      if (excludeTypes.has(itemType)) continue;

      let amount: number;
      if (ci.isAmortizable && ci.investmentAmount && safeNum(ci.investmentAmount) > 0) {
        const months = ci.amortizationMonths ?? contractDur;
        const qty = safeNum(ci.quantity);
        amount = (ci.calcMode || 'per_month') === 'per_guard'
          ? (safeNum(ci.investmentAmount) / months) * qty * totalGuards
          : (safeNum(ci.investmentAmount) / months) * qty;
      } else {
        const base = safeNum(ci.catalogItem?.basePrice);
        const override = ci.unitPriceOverride != null ? safeNum(ci.unitPriceOverride) : null;
        const unitPrice = normalizeUnit(override ?? base, ci.catalogItem?.unit);
        const qty = safeNum(ci.quantity);
        amount = (ci.calcMode || 'per_month') === 'per_guard'
          ? unitPrice * qty * totalGuards
          : unitPrice * qty;
      }

      const slug = typeToSlug.get(itemType) ?? 'other';
      const dbCat = catBySlug.get(slug);
      const catName = dbCat?.name ?? fallbackNames[slug] ?? 'Otros Costos';
      const catType = (dbCat?.type as 'direct' | 'indirect') ?? 'indirect';
      const itemName = (ci as Record<string, unknown>).customName as string ?? ci.catalogItem?.name ?? 'Sin nombre';
      const specs = ci.technicalSpecs ?? ci.catalogItem?.defaultTechnicalSpecs ?? null;

      const cat = findOrCreateCat(catName, catType);
      cat.items.push({ name: itemName, amount, technicalSpecs: specs, calcMode: ci.isAmortizable ? 'amortizable' : ci.calcMode ?? undefined });
      cat.subtotal += amount;
    }

    /* — Use costsByCategory as fallback for any categories we missed — */
    if (costSummary?.costsByCategory) {
      const existingCatNames = new Set(categories.map((c) => c.category.toLowerCase()));
      for (const cat of costSummary.costsByCategory) {
        if (cat.items.length === 0) continue;
        const slug = cat.categorySlug?.toLowerCase() ?? '';
        if (['uniform', 'exam', 'meal'].includes(slug)) continue;
        if (existingCatNames.has(cat.category.toLowerCase())) continue;
        categories.push({
          category: cat.category,
          categoryType: cat.categoryType,
          items: cat.items.map((item) => ({
            name: item.name, amount: item.amount,
            calcMode: item.calcMode, technicalSpecs: item.technicalSpecs,
          })),
          subtotal: cat.subtotal,
        });
      }
    }

    if (categories.length > 0) {
      resourceBreakdown = categories.filter((c) => c.items.length > 0);
    }
  } catch (err) {
    console.error('[Proposal] resourceBreakdown build failed:', err);
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
    installationCity: installation?.city ?? undefined,
    installationAddress,
    serviceDetail: quote.serviceDetail ?? undefined,
    coverageSchedule,
    staffingCount: totalGuards,
    staffingRegime,
    supervisionFrequency,

    items,
    totalNeto: grandTotal,
    totalNetoFormatted: fmt(grandTotal),
    currency: currency === 'UF' ? 'UF' : 'CLP',
    ufValue: ufVal > 0 ? ufVal : undefined,
    paymentTerms,
    validUntil,

    providerLogo,
    opaiLogo,
    lx3Logo,
    clientLogos,
    portalScreenshots,

    companyConfig: {
      commercialName: companyConfig.commercialName,
      companyName: companyConfig.companyName,
      brandNameUpper: companyConfig.brandNameUpper,
      website: companyConfig.website,
      phone: companyConfig.phone,
      email: companyConfig.email,
      brandingLogoWhite: abs(companyConfig.brandingLogoWhite) || undefined,
      brandingLogoFull: abs(companyConfig.brandingLogoFull) || undefined,
      brandingLogoIcon: abs(companyConfig.brandingLogoIcon) || undefined,
    },
    clientLogosWithNames: clientesConLogo
      .map((c) => ({ name: c.name, url: c.logo ? abs(c.logo) : '' })),

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
    regimeExplanation,
    breakdown,
    resourceBreakdown,
    includedItems: (quote.includedItems ?? []).filter((t) => t.trim().length > 0),
  };

  const fileName = buildCpqQuotePdfFileName({
    clientName: companyName,
    installationName: installation?.name ?? '',
    quoteName: quote.name,
    quoteCode: quote.code,
  });

  return { ...props, fileName };
}
