/**
 * Resolución de modo de propuesta v2 y migración puntual comercial → licitación.
 */
import type { ProposalContentV2, ProposalMode } from "./schema";

export function resolveProposalMode(opts: {
  quoteMode?: string | null;
  preferredMode?: ProposalMode;
  dealIsLicitacion?: boolean | null;
}): ProposalMode {
  if (opts.quoteMode === "licitacion" || opts.quoteMode === "comercial") {
    return opts.quoteMode;
  }
  if (opts.preferredMode === "licitacion" || opts.preferredMode === "comercial") {
    return opts.preferredMode;
  }
  return opts.dealIsLicitacion ? "licitacion" : "comercial";
}

export function hasEditedOrApprovedSections(content: ProposalContentV2): boolean {
  return content.sections.some((s) => s.status === "editada" || s.status === "aprobada");
}

/**
 * Quotes v2 en modo comercial, negocio licitación y cero secciones
 * editadas/aprobadas → se pueden resembrar a licitación.
 */
export function shouldAutoConvertComercialToLicitacion(opts: {
  dealIsLicitacion: boolean;
  content: ProposalContentV2;
}): boolean {
  return (
    opts.dealIsLicitacion &&
    opts.content.mode === "comercial" &&
    opts.content.status === "borrador" &&
    !hasEditedOrApprovedSections(opts.content)
  );
}

export function needsManualConvertToLicitacion(opts: {
  dealIsLicitacion: boolean;
  content: ProposalContentV2;
}): boolean {
  return (
    opts.dealIsLicitacion &&
    opts.content.mode === "comercial" &&
    hasEditedOrApprovedSections(opts.content)
  );
}
