import {
  collectLinkedQuoteIds,
  resolveDealActiveQuotationSummary,
  type DealWithQuoteLinks,
  type QuoteForActiveQuotation,
} from '@/lib/crm-deal-active-quotation';

function buildQuoteMap(quotes: QuoteForActiveQuotation[]) {
  return new Map(quotes.map((quote) => [quote.id, quote]));
}

describe('crm-deal-active-quotation', () => {
  it('selecciona la única cotización aunque no esté enviada', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-1',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-1' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-1',
        status: 'draft',
        currency: 'CLP',
        monthlyCost: 1250000,
        totalGuards: 12,
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 39000);

    expect(summary).toBeTruthy();
    expect(summary?.quoteId).toBe('q-1');
    expect(summary?.amountClp).toBe(1250000);
    expect(summary?.amountUf).toBeCloseTo(32.0512, 3);
    expect(summary?.totalGuards).toBe(12);
  });

  it('prioriza la cotización manual cuando está enviada', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-2',
      activeQuotationId: 'q-2',
      quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-1',
        status: 'sent',
        currency: 'CLP',
        monthlyCost: 1000000,
        updatedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'q-2',
        status: 'sent',
        currency: 'CLP',
        monthlyCost: 1600000,
        totalGuards: 9,
        updatedAt: '2025-01-01T10:00:00.000Z',
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 40000);

    expect(summary?.quoteId).toBe('q-2');
    expect(summary?.isManual).toBe(true);
    expect(summary?.amountClp).toBe(1600000);
    expect(summary?.amountUf).toBe(40);
  });

  it('en múltiples cotizaciones usa la última enviada por fecha', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-3',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }, { quoteId: 'q-3' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-1',
        status: 'sent',
        currency: 'CLP',
        monthlyCost: 700000,
        updatedAt: '2025-01-01T10:00:00.000Z',
      },
      {
        id: 'q-2',
        status: 'draft',
        currency: 'CLP',
        monthlyCost: 1000000,
        updatedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'q-3',
        status: 'sent',
        currency: 'CLP',
        monthlyCost: 1300000,
        updatedAt: '2026-02-01T10:00:00.000Z',
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 39000);

    expect(summary?.quoteId).toBe('q-3');
    expect(summary?.isManual).toBe(false);
    expect(summary?.amountClp).toBe(1300000);
  });

  it('elige la cotización aprobada como monto firme (approved cuenta igual que sent)', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-4',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }],
    };
    const quoteMap = buildQuoteMap([
      { id: 'q-1', status: 'draft', currency: 'CLP', monthlyCost: 100 },
      { id: 'q-2', status: 'approved', currency: 'CLP', monthlyCost: 200 },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 39000);

    expect(summary?.quoteId).toBe('q-2');
    expect(summary?.amountClp).toBe(200);
  });

  it('en múltiples borradores usa la más reciente (no deja el negocio en $0)', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-4b',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-1',
        status: 'draft',
        currency: 'CLP',
        monthlyCost: 100,
        totalGuards: 2,
        updatedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'q-2',
        status: 'draft',
        currency: 'CLP',
        monthlyCost: 200,
        totalGuards: 5,
        updatedAt: '2026-02-01T10:00:00.000Z',
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 39000);

    expect(summary?.quoteId).toBe('q-2');
    expect(summary?.amountClp).toBe(200);
    expect(summary?.totalGuards).toBe(5);
    expect(summary?.isManual).toBe(false);
  });

  it('consolida montos y guardias de multicotización (mismo bundle) en borrador', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-bundle-draft',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-a' }, { quoteId: 'q-b' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-a',
        code: 'CPQ-2026-236',
        status: 'draft',
        currency: 'UF',
        parameters: { salePriceMonthly: 45_000_000 },
        totalGuards: 30,
        bundleId: 'bundle-1',
        includedInProposal: true,
        updatedAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'q-b',
        code: 'CPQ-2026-237',
        status: 'draft',
        currency: 'UF',
        parameters: { salePriceMonthly: 5_000_000 },
        totalGuards: 12,
        bundleId: 'bundle-1',
        includedInProposal: true,
        updatedAt: '2026-03-02T10:00:00.000Z',
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 40_000);

    expect(summary?.amountClp).toBe(50_000_000);
    expect(summary?.amountUf).toBe(1250);
    expect(summary?.totalGuards).toBe(42);
    expect(summary?.quoteId).toBe('q-b');
    expect(summary?.status).toBe('draft');
  });

  it('consolida multicotización enviada del mismo bundle (no toma solo una instalación)', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-bundle-sent',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-a' }, { quoteId: 'q-b' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-a',
        status: 'sent',
        monthlyCost: 10_000_000,
        totalGuards: 10,
        bundleId: 'bundle-2',
        includedInProposal: true,
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
      {
        id: 'q-b',
        status: 'sent',
        monthlyCost: 4_000_000,
        totalGuards: 4,
        bundleId: 'bundle-2',
        includedInProposal: true,
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 40_000);

    expect(summary?.amountClp).toBe(14_000_000);
    expect(summary?.totalGuards).toBe(14);
  });

  it('excluye del consolidado miembros del bundle no incluidos en la propuesta', () => {
    const deal: DealWithQuoteLinks = {
      id: 'deal-bundle-excluded',
      activeQuotationId: null,
      quotes: [{ quoteId: 'q-a' }, { quoteId: 'q-b' }],
    };
    const quoteMap = buildQuoteMap([
      {
        id: 'q-a',
        status: 'draft',
        monthlyCost: 10_000_000,
        totalGuards: 10,
        bundleId: 'bundle-3',
        includedInProposal: true,
      },
      {
        id: 'q-b',
        status: 'draft',
        monthlyCost: 99_000_000,
        totalGuards: 99,
        bundleId: 'bundle-3',
        includedInProposal: false,
      },
    ]);

    const summary = resolveDealActiveQuotationSummary(deal, quoteMap, 40_000);

    // Solo cuenta el miembro incluido; ignora el excluido aunque tenga monto mayor
    expect(summary?.amountClp).toBe(10_000_000);
    expect(summary?.totalGuards).toBe(10);
    expect(summary?.quoteId).toBe('q-a');
  });

  it('extrae ids únicos de cotizaciones vinculadas', () => {
    const ids = collectLinkedQuoteIds([
      { quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }] },
      { quotes: [{ quoteId: 'q-2' }, { quoteId: 'q-3' }] },
    ]);

    expect(ids.sort()).toEqual(['q-1', 'q-2', 'q-3']);
  });
});
