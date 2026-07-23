import { describe, expect, it } from "vitest";
import { radarCollapsedSummary } from "../RadarComercialCard";
import type { RadarItemDTO } from "../radar-hub-item";

function radarItem(id: string, kind: string): RadarItemDTO {
  return {
    id,
    kind,
    status: "PENDING",
    title: `Item ${id}`,
    summary: null,
    threadId: null,
    dealId: null,
    accountId: null,
    dueAt: null,
    payload: null,
    createdAt: "2026-07-22T12:00:00.000Z",
  };
}

describe("radarCollapsedSummary", () => {
  it("comunica cantidad y tipo de novedades del contenido contraído", () => {
    const summary = radarCollapsedSummary([
      radarItem("1", "nuevo_lead"),
      radarItem("2", "nuevo_lead"),
      radarItem("3", "compromiso"),
    ]);
    expect(summary).toBe("2 Posible lead · 1 Compromiso");
  });

  it("sin novedades no muestra resumen", () => {
    expect(radarCollapsedSummary([])).toBeNull();
  });
});
