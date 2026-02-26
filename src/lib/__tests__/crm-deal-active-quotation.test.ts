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
        currency: 'UF',
        monthlyCost: 40,
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

  it('devuelve null en múltiples cotizaciones sin enviadas', () => {
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

    expect(summary).toBeNull();
  });

  it('extrae ids únicos de cotizaciones vinculadas', () => {
    const ids = collectLinkedQuoteIds([
      { quotes: [{ quoteId: 'q-1' }, { quoteId: 'q-2' }] },
      { quotes: [{ quoteId: 'q-2' }, { quoteId: 'q-3' }] },
    ]);

    expect(ids.sort()).toEqual(['q-1', 'q-2', 'q-3']);
  });
});
