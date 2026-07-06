type QuoteLinkInput = {
  quoteId: string;
};

type QuoteParametersInput = {
  salePriceMonthly?: unknown;
} | null;

export type QuoteForActiveQuotation = {
  id: string;
  code?: string | null;
  status: string;
  currency?: string | null;
  monthlyCost?: unknown;
  totalGuards?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  parameters?: QuoteParametersInput;
};

export type DealWithQuoteLinks = {
  id: string;
  activeQuotationId?: string | null;
  quotes?: QuoteLinkInput[];
};

export type ActiveQuotationSummary = {
  quoteId: string;
  code: string | null;
  status: string;
  amountClp: number;
  amountUf: number;
  totalGuards: number;
  isManual: boolean;
  sentAt: string | null;
};

// Estados "firmes" que representan el valor del negocio: enviada Y aprobada.
// (Antes solo "sent" → un negocio con la cotización "Aprobada" mostraba $0,
// incoherente con pickWinningQuote, que sí trata "approved" como ganadora.)
const FIRM_QUOTE_STATUSES = new Set(["sent", "approved"]);
const DEFAULT_UF_VALUE = 38000;

function normalizeUfValue(ufValue: number): number {
  return ufValue > 0 ? ufValue : DEFAULT_UF_VALUE;
}

function parseNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function parseDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveQuoteAmountBase(quote: QuoteForActiveQuotation): number {
  const salePriceMonthly = parseNumber(quote.parameters?.salePriceMonthly);
  if (salePriceMonthly > 0) return salePriceMonthly;
  return parseNumber(quote.monthlyCost);
}

function toQuotationAmounts(
  quote: QuoteForActiveQuotation,
  ufValue: number
): { amountClp: number; amountUf: number } {
  const normalizedUf = normalizeUfValue(ufValue);
  const amountBase = resolveQuoteAmountBase(quote);

  // salePriceMonthly and monthlyCost are always stored in CLP (from CPQ cost computation).
  // The quote.currency field is display preference only; it does not change stored values.
  // Treat amountBase as CLP to avoid absurd values when currency=UF was set but value stayed in CLP.
  const amountClp = amountBase;
  const amountUf = normalizedUf > 0 ? amountBase / normalizedUf : 0;

  return { amountClp, amountUf };
}

function getQuoteSentAt(quote: QuoteForActiveQuotation): Date | null {
  return parseDate(quote.updatedAt) ?? parseDate(quote.createdAt);
}

function isFirmQuote(quote: QuoteForActiveQuotation): boolean {
  return FIRM_QUOTE_STATUSES.has(quote.status.toLowerCase());
}

function toSummary(
  quote: QuoteForActiveQuotation,
  ufValue: number,
  isManual: boolean
): ActiveQuotationSummary {
  const sentAt = getQuoteSentAt(quote);
  const { amountClp, amountUf } = toQuotationAmounts(quote, ufValue);

  return {
    quoteId: quote.id,
    code: quote.code ?? null,
    status: quote.status,
    amountClp,
    amountUf,
    totalGuards: parseNumber(quote.totalGuards),
    isManual,
    sentAt: sentAt ? sentAt.toISOString() : null,
  };
}

export function collectLinkedQuoteIds<T extends { quotes?: QuoteLinkInput[] }>(
  deals: T[]
): string[] {
  const quoteIds = new Set<string>();
  for (const deal of deals) {
    for (const link of deal.quotes ?? []) {
      if (link.quoteId) quoteIds.add(link.quoteId);
    }
  }
  return Array.from(quoteIds);
}

export function resolveDealActiveQuotationSummary(
  deal: DealWithQuoteLinks,
  quoteById: Map<string, QuoteForActiveQuotation>,
  ufValue: number
): ActiveQuotationSummary | null {
  const linkedQuotes = (deal.quotes ?? [])
    .map((link) => quoteById.get(link.quoteId))
    .filter((quote): quote is QuoteForActiveQuotation => Boolean(quote));

  if (linkedQuotes.length === 0) return null;

  const manualQuote = deal.activeQuotationId
    ? linkedQuotes.find(
        (quote) => quote.id === deal.activeQuotationId && isFirmQuote(quote)
      )
    : undefined;

  if (manualQuote) {
    return toSummary(manualQuote, ufValue, true);
  }

  if (linkedQuotes.length === 1) {
    return toSummary(linkedQuotes[0], ufValue, false);
  }

  const firmQuotes = linkedQuotes.filter(isFirmQuote);
  if (firmQuotes.length === 0) {
    return null;
  }

  firmQuotes.sort((a, b) => {
    const bTime = getQuoteSentAt(b)?.getTime() ?? 0;
    const aTime = getQuoteSentAt(a)?.getTime() ?? 0;
    return bTime - aTime;
  });

  return toSummary(firmQuotes[0], ufValue, false);
}
