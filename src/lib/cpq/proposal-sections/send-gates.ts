/**
 * Lógica de habilitación del CTA Enviar (comercial vs licitación).
 * Extraída para tests sin montar CpqQuoteDetail.
 */
export function isCommercialSendEnabled(args: {
  proposalReady: boolean;
  hasLineItems: boolean;
  hasAccount: boolean;
  hasContact: boolean;
  hasDeal: boolean;
  quoteExists: boolean;
}): boolean {
  return (
    args.quoteExists &&
    args.proposalReady &&
    args.hasLineItems &&
    args.hasAccount &&
    args.hasContact &&
    args.hasDeal
  );
}

/**
 * Licitación: el CTA se habilita cuando TODAS las secciones no-auto tienen
 * contenido. La aprobación manual sección por sección dejó de ser requisito —
 * `markQuoteSentLicitacion` aprueba el documento en el mismo flujo.
 */
export function isLicitacionMarkSentEnabled(args: {
  contentComplete: boolean;
  quoteStatus: string;
  hasLineItems: boolean;
  hasAccount: boolean;
  hasDeal: boolean;
}): boolean {
  return (
    args.quoteStatus === "draft" &&
    args.contentComplete &&
    args.hasLineItems &&
    args.hasAccount &&
    args.hasDeal
  );
}
