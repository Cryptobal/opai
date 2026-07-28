import { describe, expect, it } from "vitest";
import { buildDealNotes } from "../email-to-crm-structure-create.service";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";

describe("buildDealNotes — supuestos eliminados", () => {
  it("excluye supuestos con removed:true", () => {
    const proposal = emptyCrmStructureProposal();
    proposal.requerimiento = "Servicio de vigilancia";
    proposal.assumptionItems = [
      {
        id: "a-0-x",
        text: "Supuesto activo",
        originalText: "Supuesto activo",
        origin: "inference",
      },
      {
        id: "a-1-y",
        text: "Supuesto borrado",
        originalText: "Supuesto borrado",
        origin: "edited",
        removed: true,
      },
    ];
    proposal.assumptions = ["Supuesto activo", "Supuesto borrado"];
    const notes = buildDealNotes(proposal);
    expect(notes).toContain("Supuesto activo");
    expect(notes).not.toContain("Supuesto borrado");
  });
});
