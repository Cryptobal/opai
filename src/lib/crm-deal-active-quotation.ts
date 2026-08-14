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
  /**
   * Total de venta mensual vigente del motor CPQ (`costSummary.salePriceMonthly`).
   * Si viene, gana al snapshot `parameters.salePriceMonthly` (puede quedar stale).
   */
  liveSalePriceMonthly?: unknown;
  /** Si la cotización pertenece a una propuesta multi-instalación. */
  bundleId?: string | null;
  /** Miembro incluido en la propuesta (default true si no viene). */
  includedInProposal?: boolean | null;
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
const REJECTED_QUOTE_STATUSES = new Set([
  "rejected",
  "lost",
  "cancelled",
  "canceled",
  "trash",
]);
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

/**
 * Precio de venta mensual vigente (CLP), alineado al header de la cotización.
 *
 * Orden: total vivo del motor → snapshot `parameters.salePriceMonthly` → 0.
 * Nunca usa `monthlyCost` (es costo, no venta). Quotes legacy sin snapshot
 * quedan en 0 (KPI con guion, sin NaN).
 */
export function resolveQuoteAmountBase(quote: QuoteForActiveQuotation): number {
  const live = parseNumber(quote.liveSalePriceMonthly);
  if (live > 0) return live;
  const snapshot = parseNumber(quote.parameters?.salePriceMonthly);
  if (snapshot > 0) return snapshot;
  return 0;
}

function toQuotationAmounts(
  quote: QuoteForActiveQuotation,
  ufValue: number
): { amountClp: number; amountUf: number } {
  const normalizedUf = normalizeUfValue(ufValue);
  const amountBase = resolveQuoteAmountBase(quote);

  // salePriceMonthly is always stored in CLP (from CPQ cost computation).
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

function isRejectedQuote(quote: QuoteForActiveQuotation): boolean {
  return REJECTED_QUOTE_STATUSES.has(quote.status.toLowerCase());
}

function isIncludedInProposal(quote: QuoteForActiveQuotation): boolean {
  return quote.includedInProposal !== false;
}

function sortByRecencyDesc(
  a: QuoteForActiveQuotation,
  b: QuoteForActiveQuotation
): number {
  const bTime = getQuoteSentAt(b)?.getTime() ?? 0;
  const aTime = getQuoteSentAt(a)?.getTime() ?? 0;
  return bTime - aTime;
}

function pickRepresentativeStatus(quotes: QuoteForActiveQuotation[]): string {
  if (quotes.some((q) => q.status.toLowerCase() === "approved")) return "approved";
  if (quotes.some((q) => q.status.toLowerCase() === "sent")) return "sent";
  return quotes[0]?.status ?? "draft";
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

/**
 * Consolida montos/guardias de varias cotizaciones de la misma propuesta
 * multi-instalación (bundle). El `quoteId`/`code` apuntan a la miembro más
 * reciente para navegación; los montos son la suma incluida.
 */
function toAggregatedBundleSummary(
  members: QuoteForActiveQuotation[],
  ufValue: number
): ActiveQuotationSummary {
  const ordered = [...members].sort(sortByRecencyDesc);
  const representative = ordered[0];
  let amountClp = 0;
  let totalGuards = 0;

  for (const quote of members) {
    amountClp += toQuotationAmounts(quote, ufValue).amountClp;
    totalGuards += parseNumber(quote.totalGuards);
  }

  const normalizedUf = normalizeUfValue(ufValue);
  const amountUf = normalizedUf > 0 ? amountClp / normalizedUf : 0;
  const sentAt = getQuoteSentAt(representative);

  return {
    quoteId: representative.id,
    code: representative.code ?? null,
    status: pickRepresentativeStatus(members),
    amountClp,
    amountUf,
    totalGuards,
    isManual: false,
    sentAt: sentAt ? sentAt.toISOString() : null,
  };
}

/**
 * Si el pool comparte un único bundleId, devuelve los miembros incluidos
 * ligados al negocio (cualquier largo ≥1). Null si no hay bundle común.
 */
function findBundleIncludedMembers(
  linkedQuotes: QuoteForActiveQuotation[],
  pool: QuoteForActiveQuotation[]
): QuoteForActiveQuotation[] | null {
  const bundleIds = Array.from(
    new Set(
      pool
        .map((q) => q.bundleId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (bundleIds.length !== 1) return null;

  const bundleId = bundleIds[0];
  if (!pool.every((q) => q.bundleId === bundleId)) return null;

  const members = linkedQuotes.filter(
    (q) =>
      q.bundleId === bundleId &&
      isIncludedInProposal(q) &&
      !isRejectedQuote(q)
  );
  return members.length > 0 ? members : null;
}

/** Consolida si hay ≥2 miembros; si hay 1, usa esa cotización sola. */
function summarizeBundleOrSingle(
  members: QuoteForActiveQuotation[],
  ufValue: number
): ActiveQuotationSummary {
  if (members.length >= 2) {
    return toAggregatedBundleSummary(members, ufValue);
  }
  return toSummary(members[0], ufValue, false);
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
  if (firmQuotes.length > 0) {
    const bundleMembers = findBundleIncludedMembers(linkedQuotes, firmQuotes);
    if (bundleMembers) {
      return summarizeBundleOrSingle(bundleMembers, ufValue);
    }

    firmQuotes.sort(sortByRecencyDesc);
    return toSummary(firmQuotes[0], ufValue, false);
  }

  // Varias cotizaciones sin enviadas/aprobadas: no dejar el negocio en $0.
  // Multicotización (mismo bundle) → suma consolidada; si no, la más reciente.
  const draftPool = linkedQuotes.filter((q) => !isRejectedQuote(q));
  if (draftPool.length === 0) return null;

  const bundleMembers = findBundleIncludedMembers(linkedQuotes, draftPool);
  if (bundleMembers) {
    return summarizeBundleOrSingle(bundleMembers, ufValue);
  }

  draftPool.sort(sortByRecencyDesc);
  return toSummary(draftPool[0], ufValue, false);
}
