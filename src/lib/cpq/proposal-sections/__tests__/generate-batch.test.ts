import { describe, expect, it } from "vitest";
import { emptyProposalV2 } from "../schema";
import { setSectionContent } from "../ops";
import { isMissingGeneratableSection } from "../generate-batch";
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
