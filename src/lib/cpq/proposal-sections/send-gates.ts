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

export function isLicitacionMarkSentEnabled(args: {
  proposalApproved: boolean;
  quoteStatus: string;
  hasLineItems: boolean;
  hasAccount: boolean;
  hasDeal: boolean;
}): boolean {
  return (
    args.quoteStatus === "draft" &&
    args.proposalApproved &&
    args.hasLineItems &&
    args.hasAccount &&
    args.hasDeal
  );
}
