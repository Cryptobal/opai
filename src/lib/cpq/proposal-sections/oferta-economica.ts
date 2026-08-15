/**
 * Sección automática «Oferta económica — apertura completa».
 * Presente en ambos modos; no editable; excluida del gate y del contador X/Y.
 */
import {
  OFERTA_ECONOMICA_KIND,
  newSectionId,
  type ProposalContentV2,
  type ProposalSection,
} from "./schema";
import { ECONOMIC_OPENING_TITLE } from "@/lib/cpq/economic-opening";

export { OFERTA_ECONOMICA_KIND };
export const OFERTA_ECONOMICA_TITLE = ECONOMIC_OPENING_TITLE;

export function isAutoSection(s: Pick<ProposalSection, "kind">): boolean {
  return s.kind === OFERTA_ECONOMICA_KIND;
}

export function gateSections<T extends Pick<ProposalSection, "kind">>(sections: T[]): T[] {
  return sections.filter((s) => !isAutoSection(s));
}

export function makeOfertaEconomicaSection(order = 0): ProposalSection {
  return {
    id: newSectionId(),
    order,
    title: OFERTA_ECONOMICA_TITLE,
    ref: null,
    status: "ia",
    sources: ["costeo"],
    content: "",
    kind: OFERTA_ECONOMICA_KIND,
    origin: "auto",
  };
}

function reindex(sections: ProposalSection[]): ProposalSection[] {
  return sections.map((s, i) => ({ ...s, order: i }));
}

/** Inserta la sección auto antes de la matriz (o al final si no hay matriz). */
export function ensureOfertaEconomica(content: ProposalContentV2): ProposalContentV2 {
  const existing = content.sections.find(isAutoSection);
  const without = content.sections.filter((s) => !isAutoSection(s));
  const matrizIdx = without.findIndex((s) => s.invariant === "matriz");
  const insertAt = matrizIdx >= 0 ? matrizIdx : without.length;
  const auto: ProposalSection = existing
    ? {
        ...existing,
        title: OFERTA_ECONOMICA_TITLE,
        kind: OFERTA_ECONOMICA_KIND,
        sources: existing.sources.length ? existing.sources : ["costeo"],
        origin: "auto",
      }
    : makeOfertaEconomicaSection();
  const next = [...without.slice(0, insertAt), auto, ...without.slice(insertAt)];
  return { ...content, sections: reindex(next) };
}
