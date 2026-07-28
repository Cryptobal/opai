import { describe, expect, it } from "vitest";
import {
  clampCorreoPanelWidth,
  correoReaderBudget,
  LIST_MIN_WIDTH,
  MIN_PANEL_WIDTH,
  RAIL_COLLAPSED,
  WORKSPACE_GAP,
} from "../useCorreosViewPreferences";

describe("correoReaderBudget", () => {
  it("1440 con riel colapsado (sin dock) → canSplit", () => {
    const budget = correoReaderBudget(1_440, true);
    expect(budget.canSplit).toBe(true);
    expect(budget.maxReader).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH);
    // lista conserva mínimo
    expect(budget.available - budget.maxReader).toBe(LIST_MIN_WIDTH);
  });

  it("728 (1280 con dock, sidebar colapsado) → canSplit=false", () => {
    // 1280 − 72 (sidebar) − 80 (padding) − 400 (dock) ≈ 728 de workspace
    const budget = correoReaderBudget(728, true);
    expect(budget.canSplit).toBe(false);
    const rail = RAIL_COLLAPSED;
    expect(budget.available).toBe(728 - rail - WORKSPACE_GAP * 2);
    expect(budget.maxReader).toBeLessThan(MIN_PANEL_WIDTH);
  });

  it("1920 con riel expandido → canSplit", () => {
    expect(correoReaderBudget(1_920, false).canSplit).toBe(true);
  });
});

describe("clampCorreoPanelWidth (reserva lista)", () => {
  it("respeta el mínimo legible del lector", () => {
    expect(clampCorreoPanelWidth(200, 1_200, true)).toBe(MIN_PANEL_WIDTH);
  });

  it("no deja al lector comerse el mínimo de la lista", () => {
    const workspace = 1_000;
    const clamped = clampCorreoPanelWidth(900, workspace, true);
    const { maxReader } = correoReaderBudget(workspace, true);
    expect(clamped).toBe(maxReader);
    expect(workspace - RAIL_COLLAPSED - WORKSPACE_GAP * 2 - clamped).toBe(
      LIST_MIN_WIDTH,
    );
  });

  it("preserva un ancho dentro del rango", () => {
    expect(clampCorreoPanelWidth(480, 1_400, true)).toBe(480);
  });

  it("workspaceWidth=0 → no clampea (SSR / primer paint)", () => {
    expect(clampCorreoPanelWidth(560, 0, true)).toBe(560);
    expect(clampCorreoPanelWidth(560, -1, true)).toBe(560);
  });
});
