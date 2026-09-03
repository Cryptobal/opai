/**
 * Marca de agua «BORRADOR» del PDF de propuesta comercial / licitación.
 *
 * El sello depende del status real de la propuesta o la cotización — no de
 * `?mode=draft`, que es el default del GET `/proposal-pdf` cuando no hay
 * query param (preview, help-chat, URL directa). Forzar el sello con
 * `pdfMode === 'draft'` pintaba BORRADOR en ofertas ya enviadas o aprobadas.
 *
 * `pdfMode: 'final'` nunca sella (adjunto de correo / envío, aunque la
 * metadata `proposalStatus` aún no se haya transicionado).
 */

export const PROPOSAL_DRAFT_WATERMARK = "BORRADOR";

/** Un PDF de borrador no debe quedar cacheado tras enviar o aprobar. */
export const PROPOSAL_PDF_CACHE_CONTROL = "private, no-store";

/** Estados del documento de propuesta v2 (y alias) que ya no son borrador. */
const CLIENT_FACING_PROPOSAL_STATUSES = new Set([
  "enviada",
  "aprobada",
  "sent",
  "approved",
  "accepted",
  "presentada",
  "adjudicada",
]);

/** Estados de CpqQuote / bundle que ya fueron oferta al cliente. */
const CLIENT_FACING_QUOTE_STATUSES = new Set([
  "sent",
  "approved",
  "accepted",
  "rejected",
]);

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isClientFacingProposalPdf(input: {
  proposalStatus?: string | null;
  quoteStatus?: string | null;
}): boolean {
  return (
    CLIENT_FACING_PROPOSAL_STATUSES.has(normalizeStatus(input.proposalStatus)) ||
    CLIENT_FACING_QUOTE_STATUSES.has(normalizeStatus(input.quoteStatus))
  );
}

export function resolveProposalWatermark(input: {
  pdfMode?: "draft" | "final" | null;
  proposalStatus?: string | null;
  quoteStatus?: string | null;
}): string | null {
  if (input.pdfMode === "final") return null;
  if (isClientFacingProposalPdf(input)) return null;
  return PROPOSAL_DRAFT_WATERMARK;
}
