import { describe, expect, it, vi } from "vitest";
import { emptyProposalV2 } from "../schema";
import { setSectionContent } from "../ops";
import {
  generateProposalSectionsBatch,
  isMissingGeneratableSection,
} from "../generate-batch";
import { isAutoSection } from "../oferta-economica";

vi.mock("../generate-section", () => ({
  generateProposalSection: vi.fn(async ({ section }: { section: { title: string } }) => ({
    content: `IA:${section.title}`,
    sources: ["mock"],
    gaps: [],
    fallback: false,
    ref: null,
  })),
}));

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

  it("trata exclusiones stub como missing salvo editada", () => {
    const content = emptyProposalV2("comercial");
    const excl = content.sections.find((s) => s.invariant === "exclusiones")!;
    expect(excl.content).toMatch(/Pendiente/);
    expect(isMissingGeneratableSection(excl)).toBe(true);

    let edited = setSectionContent(content, excl.id, "Pendiente de completar.", {
      mark: "editada",
    });
    const editedExcl = edited.sections.find((s) => s.invariant === "exclusiones")!;
    expect(editedExcl.status).toBe("editada");
    expect(isMissingGeneratableSection(editedExcl)).toBe(false);
  });
});

describe("generateProposalSectionsBatch maxSections/remaining", () => {
  const baseArgs = {
    tenantId: "t1",
    quote: {
      code: "CPQ-TEST",
      name: "Test",
      clientName: "Cliente",
      totalGuards: 1,
      totalPositions: 1,
    },
    fixedSections: [] as { key: string; title: string; content: string }[],
    positions: [],
    corpus: null,
    onlyMissing: true as const,
  };

  it("sin maxSections procesa todas las elegibles y remaining vacío", async () => {
    const content = emptyProposalV2("comercial");
    const eligible = content.sections.filter((s) => isMissingGeneratableSection(s));
    expect(eligible.length).toBeGreaterThan(2);

    const result = await generateProposalSectionsBatch({
      ...baseArgs,
      content,
    });
    expect(result.remainingSectionIds).toEqual([]);
    expect(result.progress.generated + result.progress.failed).toBe(eligible.length);
  });

  it("con maxSections limita y reporta remainingSectionIds", async () => {
    const content = emptyProposalV2("comercial");
    const eligible = content.sections.filter((s) => isMissingGeneratableSection(s));
    expect(eligible.length).toBeGreaterThan(2);

    const result = await generateProposalSectionsBatch({
      ...baseArgs,
      content,
      maxSections: 2,
    });
    expect(result.progress.generated + result.progress.failed).toBe(2);
    expect(result.remainingSectionIds).toHaveLength(eligible.length - 2);
    expect(result.remainingSectionIds[0]).toBe(eligible[2]!.id);
  });

  it("sectionIds filtra el subconjunto", async () => {
    const content = emptyProposalV2("comercial");
    const eligible = content.sections.filter((s) => isMissingGeneratableSection(s));
    const pick = [eligible[0]!.id, eligible[2]!.id];

    const result = await generateProposalSectionsBatch({
      ...baseArgs,
      content,
      sectionIds: pick,
    });
    expect(result.progress.generated + result.progress.failed).toBe(2);
    expect(result.remainingSectionIds).toEqual([]);
  });
});
