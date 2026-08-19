import { describe, expect, it, vi, beforeEach } from "vitest";
import { emptyProposalV2 } from "../schema";
import { emptyFinalProposalSectionTitles } from "@/lib/pdf/templates/proposal/final-proposal-gate";
import {
  generateMissingProposalSectionsForQuote,
  prioritizeMissingSectionIds,
} from "../generate-missing-for-quote";
import { loadQuoteProposal, saveQuoteProposal } from "../persist";
import { isMissingGeneratableSection } from "../generate-batch";

vi.mock("../persist", () => ({
  loadQuoteProposal: vi.fn(),
  saveQuoteProposal: vi.fn(async ({ content }: { content: unknown }) => content),
}));

vi.mock("../generate-section", () => ({
  generateProposalSection: vi.fn(async ({ section }: { section: { title: string } }) => ({
    content: `IA:${section.title}`,
    sources: ["mock"],
    gaps: [],
    fallback: false,
    ref: null,
  })),
}));

vi.mock("@/lib/cpq/fixed-sections", () => ({
  ensureFixedSectionsSeeded: vi.fn(),
  listFixedSections: vi.fn(async () => [
    { key: "quienes", title: "Quiénes somos y organigrama", content: "FIJA quienes" },
    { key: "uniformes", title: "Uniformes y EPP", content: "FIJA uniformes" },
    { key: "capacitacion", title: "Capacitación", content: "FIJA capacitacion" },
    { key: "opai", title: "OPAI y SLA", content: "FIJA opai" },
    { key: "supervision", title: "Supervisión y contingencias", content: "FIJA supervision" },
    { key: "preventivo", title: "Enfoque preventivo", content: "FIJA preventivo" },
    { key: "experiencia", title: "Experiencia y certificaciones", content: "FIJA experiencia" },
  ]),
}));

vi.mock("../build-dotacion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../build-dotacion")>();
  return {
    ...actual,
    loadDotacionPositions: vi.fn(async () => []),
  };
});

vi.mock("@/modules/crm/documents/licitacion-ingest.service", () => ({
  buildLicitacionCorpus: vi.fn(),
  licitacionGenerationGate: vi.fn(() => null),
}));

describe("prioritizeMissingSectionIds", () => {
  it("pone Gantt y exclusiones antes que el resto de IA", () => {
    const content = emptyProposalV2("comercial");
    const ids = prioritizeMissingSectionIds(content.sections);
    const gantt = content.sections.find((s) => s.title === "Carta Gantt")!;
    const excl = content.sections.find((s) => s.invariant === "exclusiones")!;
    const resumen = content.sections.find((s) => s.title === "Resumen ejecutivo")!;
    expect(isMissingGeneratableSection(excl)).toBe(true);
    expect(ids.indexOf(gantt.id)).toBeLessThan(ids.indexOf(resumen.id));
    expect(ids.indexOf(excl.id)).toBeLessThan(ids.indexOf(resumen.id));
  });
});

describe("generateMissingProposalSectionsForQuote", () => {
  beforeEach(() => {
    vi.mocked(loadQuoteProposal).mockReset();
    vi.mocked(saveQuoteProposal).mockClear();
  });

  it("rellena Gantt y exclusiones stub (mock IA + fijas)", async () => {
    const content = emptyProposalV2("comercial");
    vi.mocked(loadQuoteProposal).mockResolvedValue({
      quote: {
        id: "q1",
        code: "CPQ-1",
        name: "Test",
        clientName: "Cliente",
        dealId: null,
        proposalStatus: "borrador",
        proposalMode: "comercial",
        proposalAiContent: content,
        updatedAt: new Date(),
        totalGuards: 1,
        totalPositions: 1,
      },
      content,
      dealIsLicitacion: false,
    });

    const result = await generateMissingProposalSectionsForQuote("t1", "q1");
    expect(result).toBeTruthy();
    expect(result!.generated).toBeGreaterThan(0);
    expect(saveQuoteProposal).toHaveBeenCalled();

    const saved = vi.mocked(saveQuoteProposal).mock.calls[0]![0].content;
    const gantt = saved.sections.find((s) => s.title === "Carta Gantt");
    const excl = saved.sections.find((s) => s.invariant === "exclusiones");
    expect(gantt?.content).toMatch(/IA:Carta Gantt/);
    expect(excl?.content).toMatch(/IA:Exclusiones/);
    expect(excl?.content).not.toMatch(/Pendiente de completar/);

    const gated = emptyFinalProposalSectionTitles(saved.sections);
    expect(gated).not.toContain("Carta Gantt");
    expect(gated).not.toContain("Exclusiones y supuestos");
  });
});
