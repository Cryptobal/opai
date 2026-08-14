import { describe, expect, it } from "vitest";
import { emptyProposalV2 } from "../schema";
import { setSectionContent, approveSection } from "../ops";
import {
  hasEditedOrApprovedSections,
  needsManualConvertToLicitacion,
  resolveProposalMode,
  shouldAutoConvertComercialToLicitacion,
} from "../mode";

describe("resolveProposalMode", () => {
  it("usa el modo persistido de la quote", () => {
    expect(
      resolveProposalMode({ quoteMode: "comercial", dealIsLicitacion: true }),
    ).toBe("comercial");
    expect(resolveProposalMode({ quoteMode: "licitacion" })).toBe("licitacion");
  });

  it("siembra por deal.isLicitacion cuando no hay modo", () => {
    expect(resolveProposalMode({ dealIsLicitacion: true })).toBe("licitacion");
    expect(resolveProposalMode({ dealIsLicitacion: false })).toBe("comercial");
    expect(resolveProposalMode({})).toBe("comercial");
  });
});

describe("migración puntual comercial → licitación", () => {
  it("convierte contenido comercial sin ediciones", () => {
    const content = emptyProposalV2("comercial");
    expect(
      shouldAutoConvertComercialToLicitacion({ dealIsLicitacion: true, content }),
    ).toBe(true);
    expect(hasEditedOrApprovedSections(content)).toBe(false);
  });

  it("no convierte si hay secciones editadas o aprobadas", () => {
    let content = emptyProposalV2("comercial");
    const sec = content.sections[1]!;
    content = setSectionContent(content, sec.id, "Texto del ejecutivo");
    expect(
      shouldAutoConvertComercialToLicitacion({ dealIsLicitacion: true, content }),
    ).toBe(false);
    expect(needsManualConvertToLicitacion({ dealIsLicitacion: true, content })).toBe(true);

    let approved = emptyProposalV2("comercial");
    const first = approved.sections[0]!;
    approved = approveSection(setSectionContent(approved, first.id, "Ok"), first.id);
    expect(
      shouldAutoConvertComercialToLicitacion({ dealIsLicitacion: true, content: approved }),
    ).toBe(false);
  });

  it("no convierte negocios comerciales", () => {
    const content = emptyProposalV2("comercial");
    expect(
      shouldAutoConvertComercialToLicitacion({ dealIsLicitacion: false, content }),
    ).toBe(false);
  });
});
