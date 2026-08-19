import { describe, expect, it } from "vitest";
import {
  emptyFinalProposalSectionTitles,
  finalProposalIncompleteMessage,
  isFinalProposalGateError,
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

  it("detecta 422 del gate y no otros 422", () => {
    const msg = finalProposalIncompleteMessage(["Carta Gantt"]);
    expect(isFinalProposalGateError(422, msg)).toBe(true);
    expect(isFinalProposalGateError(422, "El modo licitación no está disponible en bundles.")).toBe(
      false,
    );
    expect(isFinalProposalGateError(500, msg)).toBe(false);
  });
});
