/**
 * Validación de secciones del PDF de propuesta (quote / bundle) en mode=final.
 */
import type { ProposalSectionSnapshot } from "@/lib/pdf/templates/proposal/build-proposal-props";
import { isPlaceholderExclusionesContent } from "@/lib/cpq/proposal-sections/hydrate-for-pdf";
import { OFERTA_ECONOMICA_KIND } from "@/lib/cpq/proposal-sections/oferta-economica";

/** Secciones que deben tener cuerpo antes del PDF final (comercial o licitación). */
export function emptyFinalProposalSectionTitles(
  sections: readonly ProposalSectionSnapshot[] | null | undefined,
): string[] {
  if (!sections?.length) return [];
  return sections
    .filter((section) => {
      if (section.kind === OFERTA_ECONOMICA_KIND) return false;
      // Identificación se imprime desde offerer / Anexo B, no del cuerpo vacío tipico.
      if (section.invariant === "matriz" || section.invariant === "identificacion") {
        return false;
      }
      const body = section.content ?? "";
      if (section.invariant === "exclusiones") {
        return isPlaceholderExclusionesContent(body);
      }
      return !body.trim();
    })
    .map((section) => section.title);
}

export function finalProposalIncompleteMessage(emptyTitles: readonly string[]): string {
  if (emptyTitles.length === 0) return "";
  const listed = emptyTitles.slice(0, 5).join(", ");
  const more = emptyTitles.length > 5 ? ` (+${emptyTitles.length - 5} más)` : "";
  return `El PDF final exige completar estas secciones: ${listed}${more}. Generá el contenido faltante o usá el PDF borrador.`;
}
