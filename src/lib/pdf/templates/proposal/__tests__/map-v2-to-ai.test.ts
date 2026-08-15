import { describe, expect, it } from "vitest";
import { emptyProposalV2 } from "@/lib/cpq/proposal-sections/schema";
import { setSectionContent } from "@/lib/cpq/proposal-sections/ops";
import { mapV2ToProposalAI } from "../map-v2-to-ai";

describe("mapV2ToProposalAI", () => {
  it("mapea identificación, resumen y comprensión a props del variant technical", () => {
    let content = emptyProposalV2("comercial");
    const ident = content.sections.find((s) => /identific/i.test(s.title))!;
    const resumen = content.sections.find((s) => /resumen/i.test(s.title))!;
    const comprension = content.sections.find((s) => /comprensi[oó]n/i.test(s.title))!;
    content = setSectionContent(content, ident.id, "Acme SpA — faena norte");
    content = setSectionContent(content, resumen.id, "Resumen ejecutivo v2");
    content = setSectionContent(content, comprension.id, "Análisis de necesidades v2");
    const ai = mapV2ToProposalAI(content);
    expect(ai.descripcionBreve).toBe("Acme SpA — faena norte");
    expect(ai.resumenEjecutivo).toBe("Resumen ejecutivo v2");
    expect(ai.analisisNecesidades).toBe("Análisis de necesidades v2");
  });

  it("extrae cargos sin dotación y certificaciones desde capítulos institucionales", () => {
    let content = emptyProposalV2("comercial");
    const quienes = content.sections.find((s) => /qui[eé]nes somos/i.test(s.title))!;
    const experiencia = content.sections.find((s) => /experiencia/i.test(s.title))!;
    content = setSectionContent(
      content,
      quienes.id,
      [
        "Nuestra estructura institucional:",
        "• Gerencia General",
        "• Supervisión de terreno (12 personas)",
        "• 35 guardias de seguridad",
      ].join("\n"),
    );
    content = setSectionContent(
      content,
      experiencia.id,
      [
        "Certificaciones vigentes:",
        "• Acreditación OS-10 de Carabineros de Chile",
        "• Experiencia en industria y logística",
      ].join("\n"),
    );

    const ai = mapV2ToProposalAI(content);

    expect(ai.organigramRoles).toEqual([
      "Gerencia General",
      "Supervisión de terreno",
    ]);
    expect(ai.organigramRoles?.join(" ")).not.toMatch(/\d/);
    expect(ai.certifications).toEqual([
      "Acreditación OS-10 de Carabineros de Chile",
    ]);
    expect(ai.institutional?.quienesSomos).toContain("Gerencia General");
    expect(ai.institutional?.experienciaCertificaciones).toContain("OS-10");
  });
});
