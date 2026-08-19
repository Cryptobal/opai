/**
 * Cotización de referencia del bundle: narrativa del PDF consolidado.
 * Primera hija `includedInProposal` por `displayOrder`.
 */
export function referenceQuoteIdFromMembers(
  quotes: readonly {
    quoteId: string;
    includedInProposal: boolean;
    displayOrder: number;
  }[],
): string | null {
  const included = quotes
    .filter((row) => row.includedInProposal)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.quoteId.localeCompare(b.quoteId));
  return included[0]?.quoteId ?? null;
}
