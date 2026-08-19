/**
 * Tras Enviada el costeo sigue locked; las secciones de propuesta no.
 * El flag de quote/bundle sent no se aplica al editor de propuesta.
 */
export function isProposalSectionsReadOnly(_quoteOrBundleSent: boolean): boolean {
  return false;
}
