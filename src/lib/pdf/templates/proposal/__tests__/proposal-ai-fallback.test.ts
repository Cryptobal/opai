/**
 * La IA es un adorno de la Propuesta Técnica, no su columna vertebral: si el
 * modelo rechaza o devuelve prosa (que no parsea como JSON), el PDF igual tiene
 * que salir. Este fallback es lo que se usa en ese caso.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai-service", () => ({ aiService: { generateJSON: vi.fn() } }));

import { fallbackProposalAIContent } from "../proposal-ai";

describe("fallbackProposalAIContent", () => {
  it("usa la descripción y el detalle que ya escribió el ejecutivo, sin inventar", () => {
    const c = fallbackProposalAIContent({
      companyName: "Pine",
      installationName: "SSEE Esperanza Llay Llay",
      aiDescription: "Arriendo mensual de garita y traslados de instalación.",
      serviceDetail: "• Incluye arriendo mensual de garita",
      industry: "Energía",
    });

    expect(c.descripcionBreve).toBe("Propuesta para Pine — SSEE Esperanza Llay Llay");
    expect(c.resumenEjecutivo).toBe("Arriendo mensual de garita y traslados de instalación.");
    expect(c.analisisNecesidades).toBe("• Incluye arriendo mensual de garita");
    expect(c.sectoresRelevantes).toEqual(["Energía"]);
  });

  it("sin descripción ni detalle: texto neutro, nunca menciona guardias", () => {
    const c = fallbackProposalAIContent({ companyName: "Pine" });

    expect(c.descripcionBreve).toBe("Propuesta para Pine");
    const todo = [c.descripcionBreve, c.resumenEjecutivo, c.analisisNecesidades].join(" ");
    expect(todo).not.toMatch(/guardia|dotaci[oó]n|turno/i);
    // Todos los campos con contenido: el PDF no puede quedar con huecos vacíos.
    expect(c.resumenEjecutivo.length).toBeGreaterThan(0);
    expect(c.analisisNecesidades.length).toBeGreaterThan(0);
    expect(c.sectoresRelevantes.length).toBeGreaterThan(0);
  });

  it("strings vacíos o whitespace no pasan como contenido", () => {
    const c = fallbackProposalAIContent({
      companyName: "Pine",
      installationName: "   ",
      aiDescription: "   ",
      serviceDetail: "",
    });
    expect(c.descripcionBreve).toBe("Propuesta para Pine");
    expect(c.resumenEjecutivo).toContain("Pine");
  });
});
