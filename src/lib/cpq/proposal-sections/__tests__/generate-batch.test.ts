import { describe, expect, it, vi } from "vitest";

// La generación real llama al modelo: acá solo interesa el control de flujo del batch.
vi.mock("@/lib/cpq/proposal-sections/generate-section", () => ({
  generateProposalSection: vi.fn(async ({ section }: { section: { title: string } }) => ({
    content: `Contenido generado para ${section.title}`,
    sources: [],
    gaps: [],
    ref: null,
    fallback: false,
  })),
}));

import { emptyProposalV2 } from "../schema";
import { setSectionContent } from "../ops";
import {
  generateProposalSectionsBatch,
  isMissingGeneratableSection,
} from "../generate-batch";
import { isAutoSection } from "../oferta-economica";

describe("isMissingGeneratableSection", () => {
  it("incluye secciones vacías no auto", () => {
    const content = emptyProposalV2("comercial");
    const empty = content.sections.find((s) => !isAutoSection(s) && !s.content.trim());
    expect(empty).toBeTruthy();
    expect(isMissingGeneratableSection(empty!)).toBe(true);
  });

  it("excluye secciones con contenido", () => {
    let content = emptyProposalV2("comercial");
    const target = content.sections.find((s) => !isAutoSection(s))!;
    content = setSectionContent(content, target.id, "Texto ya generado");
    const filled = content.sections.find((s) => s.id === target.id)!;
    expect(isMissingGeneratableSection(filled)).toBe(false);
  });

  it("excluye secciones editadas aunque queden vacías", () => {
    let content = emptyProposalV2("comercial");
    const target = content.sections.find((s) => !isAutoSection(s))!;
    content = setSectionContent(content, target.id, "x", { mark: "editada" });
    content = setSectionContent(content, target.id, "", { mark: "editada" });
    const edited = content.sections.find((s) => s.id === target.id)!;
    expect(edited.status).toBe("editada");
    expect(isMissingGeneratableSection(edited)).toBe(false);
  });

  it("excluye oferta económica automática", () => {
    const content = emptyProposalV2("comercial");
    const auto = content.sections.find((s) => isAutoSection(s));
    expect(auto).toBeTruthy();
    expect(isMissingGeneratableSection(auto!)).toBe(false);
  });
});

describe("generateProposalSectionsBatch — tope por llamada", () => {
  const baseArgs = {
    tenantId: "t1",
    quote: {
      code: "CPQ-1",
      name: "Licitación Enex",
      clientName: "Enex",
      totalGuards: 4,
      totalPositions: 2,
    },
    fixedSections: [] as const,
    positions: [] as const,
    corpus: null,
    onlyMissing: true,
  };

  it("sin maxSections genera todas las elegibles y no deja pendientes", async () => {
    const content = emptyProposalV2("comercial");
    const result = await generateProposalSectionsBatch({ ...baseArgs, content });
    expect(result.remainingSectionIds).toEqual([]);
    expect(result.progress.generated).toBeGreaterThan(0);
  });

  it("maxSections corta el batch y devuelve el resto para iterar", async () => {
    const content = emptyProposalV2("comercial");
    const elegibles = content.sections.filter((s) => isMissingGeneratableSection(s)).length;
    expect(elegibles).toBeGreaterThan(2);

    const first = await generateProposalSectionsBatch({
      ...baseArgs,
      content,
      maxSections: 2,
    });
    expect(first.progress.generated + first.progress.failed).toBe(2);
    expect(first.remainingSectionIds).toHaveLength(elegibles - 2);

    // Segunda pasada con el remanente: termina sin pendientes.
    const second = await generateProposalSectionsBatch({
      ...baseArgs,
      content: first.content,
      sectionIds: first.remainingSectionIds,
    });
    expect(second.remainingSectionIds).toEqual([]);
  });

  it("sectionIds restringe el batch al subconjunto pedido", async () => {
    const content = emptyProposalV2("comercial");
    const target = content.sections.find((s) => isMissingGeneratableSection(s))!;
    const result = await generateProposalSectionsBatch({
      ...baseArgs,
      content,
      sectionIds: [target.id],
    });
    expect(result.progress.generated + result.progress.failed).toBe(1);
    expect(result.content.sections.find((s) => s.id === target.id)?.content.trim()).toBeTruthy();
  });
});
