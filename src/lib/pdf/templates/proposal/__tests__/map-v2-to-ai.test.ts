import { describe, expect, it } from "vitest";
import { emptyProposalV2 } from "@/lib/cpq/proposal-sections/schema";
import { setSectionContent } from "@/lib/cpq/proposal-sections/ops";
import { mapV2ToProposalAI } from "../map-v2-to-ai";

describe("mapV2ToProposalAI", () => {
  it("mapea identificación, resumen y análisis a props del variant technical", () => {
    let content = emptyProposalV2("comercial");
    const ident = content.sections.find((s) => /identific/i.test(s.title))!;
    const resumen = content.sections.find((s) => /resumen/i.test(s.title))!;
    const analisis = content.sections.find((s) => /an[aá]lisis/i.test(s.title))!;
    content = setSectionContent(content, ident.id, "Acme SpA — faena norte");
    content = setSectionContent(content, resumen.id, "Resumen ejecutivo v2");
    content = setSectionContent(content, analisis.id, "Análisis de necesidades v2");
    const ai = mapV2ToProposalAI(content);
    expect(ai.descripcionBreve).toBe("Acme SpA — faena norte");
    expect(ai.resumenEjecutivo).toBe("Resumen ejecutivo v2");
    expect(ai.analisisNecesidades).toBe("Análisis de necesidades v2");
  });
});
