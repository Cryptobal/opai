import { describe, expect, it } from "vitest";
import {
  emptyFinalProposalSectionTitles,
  finalProposalIncompleteMessage,
} from "../final-proposal-gate";

describe("emptyFinalProposalSectionTitles", () => {
  it("ignora oferta económica y matriz", () => {
    const empty = emptyFinalProposalSectionTitles([
      { id: "1", order: 0, title: "Resumen", content: "ok" },
      { id: "2", order: 1, title: "Oferta", content: "", kind: "oferta_economica" },
      {
        id: "3",
        order: 2,
        title: "Matriz de cumplimiento",
        content: "",
        invariant: "matriz",
      },
    ]);
    expect(empty).toEqual([]);
  });

  it("marca Gantt vacío y exclusiones stub", () => {
    const empty = emptyFinalProposalSectionTitles([
      { id: "1", order: 0, title: "Carta Gantt", content: "" },
      {
        id: "2",
        order: 1,
        title: "Exclusiones y supuestos",
        content: "Pendiente de completar.",
        invariant: "exclusiones",
      },
    ]);
    expect(empty).toEqual(["Carta Gantt", "Exclusiones y supuestos"]);
  });

  it("mensaje de error lista hasta 5 títulos", () => {
    const msg = finalProposalIncompleteMessage(["A", "B", "C"]);
    expect(msg).toMatch(/A, B, C/);
    expect(msg).toMatch(/PDF borrador/);
  });
});
