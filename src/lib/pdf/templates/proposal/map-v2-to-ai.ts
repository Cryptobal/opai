/**
 * Mapea secciones v2 comerciales a las props AI del variant `technical`.
 */
import { findInvariant, type ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalAIContent } from "./proposal-ai";

function sectionByTitle(content: ProposalContentV2, re: RegExp): string {
  const hit = [...content.sections]
    .sort((a, b) => a.order - b.order)
    .find((s) => re.test(s.title));
  return hit?.content.trim() ?? "";
}

export function mapV2ToProposalAI(content: ProposalContentV2): ProposalAIContent {
  const ident =
    findInvariant(content, "identificacion")?.content.trim() ||
    sectionByTitle(content, /identific/i);
  const resumen = sectionByTitle(content, /resumen/i);
  const analisis = sectionByTitle(content, /an[aá]lisis/i);
  return {
    descripcionBreve: ident || resumen || "Propuesta comercial",
    resumenEjecutivo: resumen || ident || "",
    analisisNecesidades: analisis || "",
    sectoresRelevantes: [],
  };
}
